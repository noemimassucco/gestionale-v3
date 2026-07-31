'use strict';
// ═══════ CHAT INTERNA TRA DIPENDENTI ═══════
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

// Ultimi messaggi (o solo quelli nuovi con ?after=<id>, per il polling)
router.get('/api/team-chat', authMiddleware, async (req, res) => {
  try {
    const after = parseInt(req.query.after) || 0;
    const r = await pool.query(`
      SELECT m.id, m.testo, m.created_at, m.user_id,
             COALESCE(u.nome, u.email, 'Utente') AS autore
      FROM team_messaggi m LEFT JOIN users u ON m.user_id = u.id
      WHERE m.id > $1
      ORDER BY m.id DESC LIMIT 100`, [after]);
    res.json(r.rows.reverse());
  } catch(e) { console.error('GET /api/team-chat:', e.message); res.status(500).json({ error: e.message }); }
});

router.post('/api/team-chat', authMiddleware, async (req, res) => {
  try {
    const testo = String(req.body.testo || '').trim();
    if (!testo) return res.status(400).json({ error: 'Messaggio vuoto' });
    if (testo.length > 2000) return res.status(400).json({ error: 'Messaggio troppo lungo (max 2000 caratteri)' });
    const r = await pool.query(
      'INSERT INTO team_messaggi (user_id, testo) VALUES ($1,$2) RETURNING id, testo, created_at, user_id',
      [req.user.id, testo]);
    res.json(r.rows[0]);
  } catch(e) { console.error('POST /api/team-chat:', e.message); res.status(500).json({ error: e.message }); }
});

// L'autore (o un admin) può eliminare un proprio messaggio
router.delete('/api/team-chat/:id', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `DELETE FROM team_messaggi WHERE id=$1 AND (user_id=$2 OR $3='admin') RETURNING id`,
      [req.params.id, req.user.id, req.user.ruolo || '']);
    res.json({ ok: r.rows.length > 0 });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
