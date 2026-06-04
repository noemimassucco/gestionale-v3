'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

// ── Helper runtime stato ─────────────────────────────────
function statoRuntime(row) {
  if (row.is_lead) return 'lead';
  if (parseInt(row.sub_attivi) > 0) return 'attivo';
  return 'ex';
}

// ═══════════════════════════════════════════════════════════
// GET /api/clienti
// ?stato=attivo|ex|lead|all  ?pipeline=  ?fonte=  ?search=
// ═══════════════════════════════════════════════════════════
router.get('/api/clienti', authMiddleware, async (req, res) => {
  const { stato = 'all', pipeline, fonte, search } = req.query;
  try {
    const params = [];
    const wheres = [];

    if (search)   { params.push(`%${search}%`);  wheres.push(`(i.ragione_sociale ILIKE $${params.length} OR i.nome ILIKE $${params.length} OR i.cognome ILIKE $${params.length} OR i.tel ILIKE $${params.length})`); }
    if (pipeline) { params.push(pipeline);        wheres.push(`i.lead_stato_pipeline = $${params.length}`); }
    if (fonte)    { params.push(fonte);           wheres.push(`i.lead_fonte = $${params.length}`); }
    if (stato === 'lead')  wheres.push("i.is_lead = true");
    if (stato === 'attivo') wheres.push("i.is_lead = false");
    if (stato === 'ex')    wheres.push("i.is_lead = false");

    const where = wheres.length ? 'WHERE ' + wheres.join(' AND ') : '';

    const rows = (await pool.query(`
      SELECT i.*,
        u.nome   AS owner_nome,
        u.email  AS owner_email,
        s_int.codice AS ricerca_sub_codice,
        COUNT(DISTINCT s.id) FILTER (WHERE s.stato_occupazione NOT IN ('libero','dismesso')) AS sub_attivi,
        COUNT(DISTINCT s.id) AS sub_totale,
        (SELECT COUNT(*) FROM promemoria p
          WHERE p.entita_tipo IN ('cliente','lead') AND p.entita_id = i.id
            AND p.completato = false) AS promemoria_attivi,
        (SELECT json_build_object('id',p2.id,'titolo',p2.titolo,'data_evento',p2.data_evento,
                                   'ora_evento',p2.ora_evento,'tipo_azione',p2.tipo_azione)
          FROM promemoria p2
          WHERE p2.entita_tipo IN ('cliente','lead') AND p2.entita_id = i.id
            AND p2.completato = false
          ORDER BY p2.data_evento, p2.ora_evento NULLS LAST
          LIMIT 1) AS prossimo_promemoria
      FROM inquilini i
      LEFT JOIN users   u     ON i.lead_owner_user_id   = u.id
      LEFT JOIN subs    s_int ON i.ricerca_sub_interesse_id = s_int.id
      LEFT JOIN subs    s     ON s.inquilino_id          = i.id
      ${where}
      GROUP BY i.id, u.nome, u.email, s_int.codice
      ORDER BY i.ragione_sociale
    `, params)).rows;

    // Calcola stato runtime + filtro attivo/ex
    const enriched = rows.map(r => ({ ...r, stato_calcolato: statoRuntime(r) }));
    const filtered = stato === 'all' ? enriched
      : stato === 'attivo' ? enriched.filter(r => r.stato_calcolato === 'attivo')
      : stato === 'ex'     ? enriched.filter(r => r.stato_calcolato === 'ex')
      : enriched; // lead già filtrato in WHERE

    res.json(filtered);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// POST /api/clienti/lead — ATOMICO: crea lead + promemoria
// ═══════════════════════════════════════════════════════════
router.post('/api/clienti/lead', authMiddleware, async (req, res) => {
  const {
    nome, cognome, ragione_sociale,
    tel, tel_alt, email, lead_fonte,
    ricerca_tipologia, ricerca_categoria, ricerca_zona,
    ricerca_mq_min, ricerca_mq_max, ricerca_stanze,
    ricerca_budget_max, ricerca_disponibilita_da,
    ricerca_sub_interesse_id,
    note_lead,
    // Promemoria opzionale
    promemoria,
  } = req.body;

  const rs = ragione_sociale || [nome, cognome].filter(Boolean).join(' ').trim();
  if (!rs) return res.status(400).json({ error: 'Nome o ragione sociale obbligatorio' });
  if (!tel && !email) return res.status(400).json({ error: 'Telefono o email obbligatorio' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const r = await client.query(`
      INSERT INTO inquilini (
        ragione_sociale, nome, cognome, tel, tel_alt, email,
        is_lead, stato_cliente, lead_stato_pipeline, lead_fonte,
        lead_data_primo_contatto, lead_owner_user_id,
        ricerca_tipologia, ricerca_categoria, ricerca_zona,
        ricerca_mq_min, ricerca_mq_max, ricerca_stanze,
        ricerca_budget_max, ricerca_disponibilita_da,
        ricerca_sub_interesse_id, note_lead
      ) VALUES ($1,$2,$3,$4,$5,$6,true,'lead','nuovo',$7,CURRENT_DATE,$8,
                $9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      RETURNING *
    `, [rs, nome||null, cognome||null, tel||null, tel_alt||null, email||null,
        lead_fonte||null, req.user.id,
        ricerca_tipologia||null, ricerca_categoria||null, ricerca_zona||null,
        ricerca_mq_min||null, ricerca_mq_max||null, ricerca_stanze||null,
        ricerca_budget_max||null, ricerca_disponibilita_da||null,
        ricerca_sub_interesse_id||null, note_lead||null]);

    const lead = r.rows[0];
    let prom_created = null;

    // Crea promemoria se richiesto
    if (promemoria?.titolo && promemoria?.data_evento) {
      const pr = await client.query(`
        INSERT INTO promemoria
          (user_id, titolo, descrizione, data_evento, ora_evento,
           tipo_azione, entita_tipo, entita_id,
           alert_giorni_prima, alert_ore_prima)
        VALUES ($1,$2,$3,$4,$5,$6,'lead',$7,$8,$9)
        RETURNING *
      `, [req.user.id, promemoria.titolo, promemoria.descrizione||null,
          promemoria.data_evento, promemoria.ora_evento||null,
          promemoria.tipo_azione||'chiamata', lead.id,
          promemoria.alert_giorni_prima || [1],
          promemoria.alert_ore_prima    || [2]]);
      prom_created = pr.rows[0];
    }

    await client.query('COMMIT');
    res.status(201).json({ lead, promemoria: prom_created });
  } catch(e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// ═══════════════════════════════════════════════════════════
// PUT /api/clienti/:id — aggiorna anagrafica + pipeline
// ═══════════════════════════════════════════════════════════
router.put('/api/clienti/:id', authMiddleware, async (req, res) => {
  const fields = [
    'ragione_sociale','nome','cognome','tel','tel_alt','email',
    'lead_fonte','lead_stato_pipeline','lead_owner_user_id',
    'ricerca_tipologia','ricerca_categoria','ricerca_zona',
    'ricerca_mq_min','ricerca_mq_max','ricerca_stanze',
    'ricerca_budget_max','ricerca_disponibilita_da','ricerca_sub_interesse_id',
    'note_lead','stato_cliente',
  ];
  const sets = []; const params = [];
  fields.forEach(f => {
    if (req.body[f] !== undefined) {
      params.push(req.body[f] === '' ? null : req.body[f]);
      sets.push(`${f} = $${params.length}`);
    }
  });
  if (!sets.length) return res.status(400).json({ error: 'Nessun campo da aggiornare' });
  params.push(req.params.id);
  try {
    const r = await pool.query(
      `UPDATE inquilini SET ${sets.join(',')} WHERE id=$${params.length} RETURNING *`, params);
    if (!r.rows.length) return res.status(404).json({ error: 'Non trovato' });
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// PUT /api/clienti/:id/converti — lead → cliente attivo
// ═══════════════════════════════════════════════════════════
router.put('/api/clienti/:id/converti-lead', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(`
      UPDATE inquilini SET is_lead=false, stato_cliente='attivo',
        lead_stato_pipeline='convertito'
      WHERE id=$1 RETURNING *
    `, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Non trovato' });
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// PUT /api/clienti/:id/perdi — lead → perso
// ═══════════════════════════════════════════════════════════
router.put('/api/clienti/:id/perdi', authMiddleware, async (req, res) => {
  const { motivo } = req.body;
  try {
    const r = await pool.query(`
      UPDATE inquilini SET lead_stato_pipeline='perso',
        lead_motivo_perdita=$1
      WHERE id=$2 RETURNING *
    `, [motivo||null, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Non trovato' });
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// GET /api/clienti/:id/timeline — eventi cronologici del lead
// ═══════════════════════════════════════════════════════════
router.get('/api/clienti/:id/timeline', authMiddleware, async (req, res) => {
  const id = req.params.id;
  try {
    const [prom, subs, ints] = await Promise.all([
      pool.query(`SELECT id, titolo, data_evento AS data, ora_evento, tipo_azione,
                    completato, completato_at, 'promemoria' AS tipo
                  FROM promemoria WHERE entita_id=$1 AND entita_tipo IN ('cliente','lead')
                  ORDER BY data_evento DESC`, [id]),
      pool.query(`SELECT s.id, s.codice, sd.nome AS sede_nome,
                    s.created_at AS data, 'contratto' AS tipo,
                    s.stato_occupazione, s.tipo_contratto
                  FROM subs s LEFT JOIN sedi sd ON s.sede_id=sd.id
                  WHERE s.inquilino_id=$1 ORDER BY s.created_at DESC`, [id]),
      pool.query(`SELECT i.id, i.protocollo, i.descrizione,
                    COALESCE(i.data_intervento,i.created_at) AS data,
                    i.prezzo, 'intervento' AS tipo
                  FROM interventi i WHERE i.inquilino_id=$1
                  ORDER BY data DESC LIMIT 20`, [id]),
    ]);

    const timeline = [
      ...prom.rows,
      ...subs.rows,
      ...ints.rows,
    ].sort((a,b) => new Date(b.data||0) - new Date(a.data||0));

    res.json(timeline);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
