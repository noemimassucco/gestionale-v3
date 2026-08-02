'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

// ═══════════════════════════════════════════════════════════
// CONTROLLO FATTURAZIONE — flusso unico di controllo dal caricamento della spesa
// (uscita) fino alla decisione di rifatturazione e all'esportazione per la contabilità.
// ═══════════════════════════════════════════════════════════

const SELECT_BASE = `
  SELECT c.*,
    s.codice as sub_codice, sd.nome as sede_nome,
    CASE
      WHEN c.attribuito_a_tipo='cliente' THEN i.ragione_sociale
      WHEN c.attribuito_a_tipo='sub' THEN sa.codice
      WHEN c.attribuito_a_tipo='condominio' THEN sda.nome
      ELSE c.attribuito_a_testo
    END as attribuito_a_nome,
    of.numero_fattura as fattura_numero, of.stato_pagamento as fattura_stato_pagamento
  FROM controllo_fatturazione c
  LEFT JOIN subs s ON c.sub_id=s.id
  LEFT JOIN sedi sd ON c.sede_id=sd.id
  LEFT JOIN inquilini i ON c.attribuito_a_tipo='cliente' AND c.attribuito_a_id=i.id
  LEFT JOIN subs sa ON c.attribuito_a_tipo='sub' AND c.attribuito_a_id=sa.id
  LEFT JOIN sedi sda ON c.attribuito_a_tipo='condominio' AND c.attribuito_a_id=sda.id
  LEFT JOIN ordini_fatturazione of ON c.fattura_id=of.id
`;

router.get('/api/controllo-fatturazione', authMiddleware, async (req, res) => {
  const { stato_decisione, rifatturabile, sede_id, sub_id, origine_tipo, search, anno, mese, anno_fattura, mese_fattura } = req.query;
  let where = ['1=1'], params = [], p = 1;
  if (stato_decisione) {
    // Supporta più stati insieme (es. tab "In sospeso" = da_decidere,sospesa,da_fatturare)
    const vals = String(stato_decisione).split(',').map(s => s.trim()).filter(Boolean);
    if (vals.length === 1) { where.push(`c.stato_decisione=$${p++}`); params.push(vals[0]); }
    else if (vals.length > 1) { where.push(`c.stato_decisione = ANY($${p++})`); params.push(vals); }
  }
  if (rifatturabile)   { where.push(`c.rifatturabile=$${p++}`); params.push(rifatturabile); }
  if (sede_id)         { where.push(`c.sede_id=$${p++}`); params.push(sede_id); }
  if (sub_id)          { where.push(`c.sub_id=$${p++}`); params.push(sub_id); }
  if (origine_tipo)    { where.push(`c.origine_tipo=$${p++}`); params.push(origine_tipo); }
  if (anno)            { where.push(`EXTRACT(YEAR FROM c.data_documento)=$${p++}`); params.push(anno); }
  if (mese)            { where.push(`EXTRACT(MONTH FROM c.data_documento)=$${p++}`); params.push(mese); }
  // Periodo di fatturazione effettivo (mese/anno dell'ordine collegato in Schema Fatturazione,
  // quello di QUANDO è stata messa a fatturare, non della spesa originale) — per la tab "Rifatturate"
  if (anno_fattura)    { where.push(`of.anno_riferimento=$${p++}`); params.push(anno_fattura); }
  if (mese_fattura)    { where.push(`of.mese_riferimento=$${p++}`); params.push(mese_fattura); }
  if (search)          { where.push(`(c.fornitore_nome ILIKE $${p} OR c.descrizione ILIKE $${p} OR c.protocollo ILIKE $${p})`); params.push(`%${search}%`); p++; }
  try {
    const r = await pool.query(`${SELECT_BASE} WHERE ${where.join(' AND ')} ORDER BY c.data_documento DESC NULLS LAST, c.id DESC`, params);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Riepilogo di controllo, non bloccante: cosa manca prima di esportare per la contabilità
router.get('/api/controllo-fatturazione/riepilogo', authMiddleware, async (req, res) => {
  try {
    const tot = await pool.query('SELECT COUNT(*) n FROM controllo_fatturazione');
    const daDecidere = await pool.query(`SELECT COUNT(*) n FROM controllo_fatturazione WHERE rifatturabile='da_decidere'`);
    const senzaAttribuzione = await pool.query(`SELECT COUNT(*) n FROM controllo_fatturazione WHERE rifatturabile='si' AND attribuito_a_tipo IS NULL`);
    const senzaProtocollo = await pool.query(`SELECT COUNT(*) n FROM controllo_fatturazione WHERE protocollo IS NULL OR protocollo=''`);
    const sospese = await pool.query(`SELECT COUNT(*) n FROM controllo_fatturazione WHERE stato_decisione='sospesa'`);
    const daFatturareVecchie = await pool.query(`SELECT COUNT(*) n FROM controllo_fatturazione WHERE stato_decisione='da_fatturare' AND data_documento < CURRENT_DATE - INTERVAL '90 days'`);
    // Possibili duplicati: stesso fornitore, stesso importo, stessa data — probabilmente la stessa spesa caricata due volte
    const duplicati = await pool.query(`
      SELECT fornitore_nome, importo, data_documento, COUNT(*) n, array_agg(id) ids
      FROM controllo_fatturazione
      WHERE fornitore_nome IS NOT NULL AND importo IS NOT NULL AND data_documento IS NOT NULL
      GROUP BY fornitore_nome, importo, data_documento
      HAVING COUNT(*) > 1`);
    const importiNonAttribuiti = await pool.query(`SELECT COALESCE(SUM(importo),0) tot FROM controllo_fatturazione WHERE rifatturabile='si' AND attribuito_a_tipo IS NULL`);
    res.json({
      totale_uscite: parseInt(tot.rows[0].n),
      da_decidere: parseInt(daDecidere.rows[0].n),
      senza_attribuzione: parseInt(senzaAttribuzione.rows[0].n),
      senza_protocollo: parseInt(senzaProtocollo.rows[0].n),
      sospese: parseInt(sospese.rows[0].n),
      da_fatturare_da_oltre_90gg: parseInt(daFatturareVecchie.rows[0].n),
      possibili_duplicati: duplicati.rows,
      importo_non_attribuito: parseFloat(importiNonAttribuiti.rows[0].tot),
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Export per la contabilità — i campi che decide/riporta lei; imponibile/IVA/stato fatturazione
// restano vuoti: li completa la contabile dopo (vedi reimport)
router.get('/api/controllo-fatturazione/export', authMiddleware, async (req, res) => {
  const { anno, sede_id, stato_decisione } = req.query;
  let where = ['1=1'], params = [], p = 1;
  if (anno) { where.push(`EXTRACT(YEAR FROM c.data_documento)=$${p++}`); params.push(anno); }
  if (sede_id) { where.push(`c.sede_id=$${p++}`); params.push(sede_id); }
  if (stato_decisione) { where.push(`c.stato_decisione=$${p++}`); params.push(stato_decisione); }
  try {
    const r = await pool.query(`${SELECT_BASE} WHERE ${where.join(' AND ')} ORDER BY c.data_documento DESC NULLS LAST, c.id DESC`, params);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/api/controllo-fatturazione/:id', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(`${SELECT_BASE} WHERE c.id=$1`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Non trovato' });
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// Sincronizzazione con lo Schema di Fatturazione: è un flusso UNICO — quando una
// uscita viene marcata "da fatturare" qui, l'ordine corrispondente compare
// automaticamente nello Schema Fatturazione (evidenziato in giallo), senza doverlo
// ricreare a mano. Se la decisione cambia prima che la contabile l'abbia lavorato
// (nessun numero fattura, non pagato), l'ordine generato viene rimosso di conseguenza.
// ═══════════════════════════════════════════════════════════
async function _syncOrdineFatturazione(pool, cf, userId) {
  const vuoleOrdine = cf.rifatturabile === 'si' && cf.stato_decisione === 'da_fatturare';

  if (vuoleOrdine && !cf.fattura_id) {
    let sub_id = null, inquilino_id = null;
    if (cf.attribuito_a_tipo === 'sub') sub_id = cf.attribuito_a_id;
    else if (cf.attribuito_a_tipo === 'cliente') inquilino_id = cf.attribuito_a_id;
    if (!sub_id && cf.sub_id) sub_id = cf.sub_id;
    if (sub_id && !inquilino_id) {
      const sr = await pool.query('SELECT inquilino_id FROM subs WHERE id=$1', [sub_id]).catch(() => null);
      inquilino_id = sr?.rows[0]?.inquilino_id || null;
    }
    const importo = cf.modalita === 'parziale' ? (cf.quota_rifatturabile || cf.importo) : cf.importo;
    const attribLabel = cf.attribuito_a_tipo === 'condominio' ? 'condominio/sede'
      : cf.attribuito_a_tipo === 'commessa' ? `commessa: ${cf.attribuito_a_testo || ''}`
      : cf.attribuito_a_tipo === 'centro_costo' ? `centro di costo: ${cf.attribuito_a_testo || ''}` : '';
    const nomeServizio = `Rifatturazione: ${(cf.fornitore_nome || cf.descrizione || 'spesa').slice(0, 80)}`;
    const _dsRaw = cf.data_documento instanceof Date ? cf.data_documento.toISOString().slice(0, 10) : (cf.data_documento ? String(cf.data_documento).slice(0, 10) : null);
    const dataSpesaLabel = _dsRaw ? `spesa del ${_dsRaw}` : null;
    const descrizione = [cf.descrizione, dataSpesaLabel, attribLabel, cf.criterio_riparto ? `criterio: ${cf.criterio_riparto}` : null]
      .filter(Boolean).join(' — ');
    // Il periodo di riferimento è QUANDO viene messa in fatturazione (oggi), non la data della
    // spesa originale — altrimenti una spesa vecchia sparirebbe dall'export filtrato sull'anno corrente.
    const rifData = new Date();
    const r = await pool.query(
      `INSERT INTO ordini_fatturazione
        (sub_id,inquilino_id,tipo_servizio,nome_servizio,descrizione,importo,periodicita,stato,
         mese_riferimento,anno_riferimento,stato_pagamento,note,created_by)
       VALUES ($1,$2,'rifatturazione_spesa',$3,$4,$5,'una_tantum','attivo',$6,$7,'non_pagato',$8,$9)
       RETURNING id`,
      [sub_id, inquilino_id, nomeServizio, descrizione || null, importo,
       rifData.getMonth() + 1, rifData.getFullYear(),
       `Generato automaticamente dal Controllo Fatturazione (uscita #${cf.id} — ${cf.origine_tipo})`, userId]);
    await pool.query('UPDATE controllo_fatturazione SET fattura_id=$1 WHERE id=$2', [r.rows[0].id, cf.id]);
    return;
  }

  if (!vuoleOrdine && cf.fattura_id) {
    const or = await pool.query('SELECT numero_fattura, stato_pagamento FROM ordini_fatturazione WHERE id=$1', [cf.fattura_id]).catch(() => null);
    const ord = or?.rows[0];
    if (ord && !ord.numero_fattura && ord.stato_pagamento !== 'pagato') {
      await pool.query('DELETE FROM ordini_fatturazione WHERE id=$1', [cf.fattura_id]);
      await pool.query('UPDATE controllo_fatturazione SET fattura_id=NULL WHERE id=$1', [cf.id]);
    }
    return;
  }

  if (vuoleOrdine && cf.fattura_id) {
    // Resta "da fatturare": tieni l'importo dell'ordine allineato, se la contabile non l'ha già lavorato
    const or = await pool.query('SELECT numero_fattura, stato_pagamento FROM ordini_fatturazione WHERE id=$1', [cf.fattura_id]).catch(() => null);
    const ord = or?.rows[0];
    if (ord && !ord.numero_fattura && ord.stato_pagamento !== 'pagato') {
      const importo = cf.modalita === 'parziale' ? (cf.quota_rifatturabile || cf.importo) : cf.importo;
      await pool.query('UPDATE ordini_fatturazione SET importo=$1, updated_at=NOW() WHERE id=$2', [importo, cf.fattura_id]).catch(() => {});
    }
  }
}

// Aggiorna SOLO i campi di decisione (mai i dati descrittivi, che restano allineati alla fonte)
router.put('/api/controllo-fatturazione/:id', authMiddleware, async (req, res) => {
  const v = req.body;
  try {
    const r = await pool.query(`
      UPDATE controllo_fatturazione SET
        rifatturabile=COALESCE($1,rifatturabile),
        modalita=$2,
        quota_rifatturabile=$3,
        attribuito_a_tipo=$4,
        attribuito_a_id=$5,
        attribuito_a_testo=$6,
        criterio_riparto=$7,
        millesimi_tabella_id=$8,
        stato_decisione=COALESCE($9,stato_decisione),
        note=$10,
        updated_at=NOW()
      WHERE id=$11 RETURNING *`,
      [v.rifatturabile||null, v.modalita||null, v.quota_rifatturabile||null,
       v.attribuito_a_tipo||null, v.attribuito_a_id||null, v.attribuito_a_testo||null,
       v.criterio_riparto||null, v.millesimi_tabella_id||null, v.stato_decisione||null,
       v.note||null, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Non trovato' });
    await _syncOrdineFatturazione(pool, r.rows[0], req.user.id);
    const fresh = await pool.query(`${SELECT_BASE} WHERE c.id=$1`, [req.params.id]);
    res.json(fresh.rows[0] || r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Re-import: la contabile ricarica il file compilato con protocollo/stato fatturazione aggiornati
router.post('/api/controllo-fatturazione/reimport', authMiddleware, async (req, res) => {
  const { rows } = req.body;
  if (!rows?.length) return res.json({ updated: 0, errors: [] });
  let updated = 0, errors = [];
  for (const row of rows) {
    try {
      const id = row.id;
      if (!id) continue;
      const updates = {};
      if (row.protocollo) updates.protocollo = row.protocollo;
      if (row.stato_decisione) updates.stato_decisione = row.stato_decisione;
      if (row.note_contabili) updates.note = row.note_contabili;
      if (!Object.keys(updates).length) continue;
      const sets = Object.keys(updates).map((k,i)=>`${k}=$${i+2}`).join(',');
      await pool.query(`UPDATE controllo_fatturazione SET ${sets}, updated_at=NOW() WHERE id=$1`, [id, ...Object.values(updates)]);
      updated++;
    } catch(e) { errors.push({ row: row.id, error: e.message }); }
  }
  res.json({ updated, errors });
});

module.exports = router;
