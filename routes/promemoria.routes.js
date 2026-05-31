'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

// ── Helper: calcola se un promemoria è "attivo ora" ──────────
function isAttivo(p) {
  const ora       = new Date();
  const dataEvento = new Date(p.data_evento);
  const oggi = new Date(); oggi.setHours(0,0,0,0);
  dataEvento.setHours(0,0,0,0);
  const diffGiorni = Math.ceil((dataEvento - oggi) / 86400000);

  if (p.completato) return false;

  // Scaduto
  if (diffGiorni < 0) return true;

  // Oggi con ora evento
  if (diffGiorni === 0 && p.ora_evento) {
    const [h,m] = p.ora_evento.split(':').map(Number);
    const msEvento = h * 3600000 + m * 60000;
    const msOra    = ora.getHours() * 3600000 + ora.getMinutes() * 60000;
    const alertOre = (p.alert_ore_prima || []).reduce((max, v) => Math.max(max, v), 0);
    return msOra >= msEvento - alertOre * 3600000;
  }

  // Entro alert_giorni_prima
  const maxGiorni = (p.alert_giorni_prima || []).reduce((max, v) => Math.max(max, v), 0);
  return diffGiorni <= maxGiorni;
}

// Classifica urgenza
function urgenza(p) {
  const oggi = new Date(); oggi.setHours(0,0,0,0);
  const d    = new Date(p.data_evento); d.setHours(0,0,0,0);
  const diff = Math.ceil((d - oggi) / 86400000);
  if (diff < 0)  return 'scaduto';   // 🔴
  if (diff === 0) return 'oggi';     // 🟠
  if (diff === 1) return 'domani';   // 🟡
  return 'prossimo';                 // 🟢
}

// ═══════════════════════════════════════════════════════════
// POST /api/promemoria
// ═══════════════════════════════════════════════════════════
router.post('/api/promemoria', authMiddleware, async (req, res) => {
  const {
    titolo, descrizione, data_evento, ora_evento,
    entita_tipo, entita_id,
    alert_giorni_prima = [], alert_ore_prima = [],
  } = req.body;

  if (!titolo || !data_evento) {
    return res.status(400).json({ error: 'titolo e data_evento obbligatori' });
  }

  try {
    const r = await pool.query(`
      INSERT INTO promemoria
        (user_id, titolo, descrizione, data_evento, ora_evento,
         entita_tipo, entita_id, alert_giorni_prima, alert_ore_prima)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [
      req.user.id, titolo, descrizione || null,
      data_evento, ora_evento || null,
      entita_tipo || null, entita_id || null,
      alert_giorni_prima, alert_ore_prima,
    ]);
    res.status(201).json(r.rows[0]);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
// GET /api/promemoria?from=&to=
// ═══════════════════════════════════════════════════════════
router.get('/api/promemoria', authMiddleware, async (req, res) => {
  const { from, to } = req.query;
  try {
    let query = `SELECT * FROM promemoria WHERE user_id = $1`;
    const params = [req.user.id];

    if (from) { query += ` AND data_evento >= $${params.length + 1}`; params.push(from); }
    if (to)   { query += ` AND data_evento <= $${params.length + 1}`; params.push(to); }
    query += ' ORDER BY data_evento, ora_evento NULLS LAST';

    const r = await pool.query(query, params);
    res.json(r.rows);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
// GET /api/promemoria/attivi-ora  — per dashboard + badge
// ═══════════════════════════════════════════════════════════
router.get('/api/promemoria/attivi-ora', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT p.*,
             i.ragione_sociale AS entita_nome_cliente,
             s.codice          AS entita_nome_sub
      FROM promemoria p
      LEFT JOIN inquilini i ON p.entita_tipo = 'cliente' AND p.entita_id = i.id
      LEFT JOIN subs      s ON p.entita_tipo = 'sub'     AND p.entita_id = s.id
      WHERE p.user_id     = $1
        AND p.completato  = false
        AND p.data_evento <= CURRENT_DATE + INTERVAL '7 days'
      ORDER BY p.data_evento, p.ora_evento NULLS LAST
    `, [req.user.id]);

    const attivi = r.rows
      .filter(p => isAttivo(p))
      .map(p => ({
        ...p,
        urgenza: urgenza(p),
        entita_nome: p.entita_nome_cliente || p.entita_nome_sub || null,
      }));

    res.json(attivi);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
// PUT /api/promemoria/:id/completato
// ═══════════════════════════════════════════════════════════
router.put('/api/promemoria/:id/completato', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(`
      UPDATE promemoria SET completato = true
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `, [req.params.id, req.user.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Non trovato' });
    res.json(r.rows[0]);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
// DELETE /api/promemoria/:id
// ═══════════════════════════════════════════════════════════
router.delete('/api/promemoria/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM promemoria WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
