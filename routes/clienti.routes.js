'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

// ── Calcola stato cliente a runtime ─────────────────────────
// attivo  → ha sub o contratto attivo collegato
// lead    → is_lead = true
// ex      → anagrafica presente ma nessun legame attivo
async function calcolaStato(client, inqId) {
  const r = await client.query(`
    SELECT 1 FROM subs
    WHERE inquilino_id = $1
      AND stato_occupazione NOT IN ('libero','dismesso')
    LIMIT 1
  `, [inqId]);
  if (r.rows.length) return 'attivo';
  return 'ex';
}

// ═══════════════════════════════════════════════════════════
// GET /api/clienti — lista con stato calcolato
// Query param: ?stato=attivo|ex|lead|all  (default: all)
// ═══════════════════════════════════════════════════════════
router.get('/api/clienti', authMiddleware, async (req, res) => {
  const { stato = 'all', search = '' } = req.query;
  try {
    let rows = (await pool.query(`
      SELECT
        i.*,
        COUNT(DISTINCT s.id)  FILTER (WHERE s.stato_occupazione NOT IN ('libero','dismesso'))
                              AS sub_attivi,
        COUNT(DISTINCT s.id)  AS sub_totale
      FROM inquilini i
      LEFT JOIN subs s ON s.inquilino_id = i.id
      ${search ? "WHERE i.ragione_sociale ILIKE $1" : ''}
      GROUP BY i.id
      ORDER BY i.ragione_sociale
    `, search ? [`%${search}%`] : [])).rows;

    // Calcola/arricchisci stato
    rows = rows.map(r => {
      let st = r.stato_cliente;
      if (!st) {
        if (r.is_lead) st = 'lead';
        else if (parseInt(r.sub_attivi) > 0) st = 'attivo';
        else st = 'ex';
      }
      return { ...r, stato_calcolato: st };
    });

    // Filtra per stato
    if (stato !== 'all') {
      rows = rows.filter(r => r.stato_calcolato === stato);
    }

    res.json(rows);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
// POST /api/clienti/lead — crea nuovo lead
// ═══════════════════════════════════════════════════════════
router.post('/api/clienti/lead', authMiddleware, async (req, res) => {
  const { nome, cognome, telefono, email, note } = req.body;
  const ragione_sociale = [nome, cognome].filter(Boolean).join(' ').trim();
  if (!ragione_sociale) {
    return res.status(400).json({ error: 'Nome o ragione sociale obbligatorio' });
  }
  try {
    const r = await pool.query(`
      INSERT INTO inquilini
        (ragione_sociale, tel, email, is_lead, lead_note,
         lead_data_primo_contatto, stato_cliente)
      VALUES ($1, $2, $3, true, $4, CURRENT_DATE, 'lead')
      RETURNING *
    `, [ragione_sociale, telefono || null, email || null, note || null]);
    res.status(201).json(r.rows[0]);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
// PUT /api/clienti/:id/converti-lead — lead → cliente attivo
// ═══════════════════════════════════════════════════════════
router.put('/api/clienti/:id/converti-lead', authMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const r = await pool.query(`
      UPDATE inquilini
      SET is_lead = false,
          stato_cliente = 'attivo',
          lead_note = COALESCE(lead_note, ''),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Cliente non trovato' });
    res.json(r.rows[0]);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
// PUT /api/clienti/:id — aggiorna stato manuale
// ═══════════════════════════════════════════════════════════
router.put('/api/clienti/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { stato_cliente, lead_note } = req.body;
  try {
    const r = await pool.query(`
      UPDATE inquilini
      SET stato_cliente = COALESCE($1, stato_cliente),
          lead_note     = COALESCE($2, lead_note),
          is_lead       = CASE WHEN $1 = 'lead' THEN true
                               WHEN $1 IN ('attivo','ex') THEN false
                               ELSE is_lead END
      WHERE id = $3
      RETURNING *
    `, [stato_cliente || null, lead_note || null, id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Non trovato' });
    res.json(r.rows[0]);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
