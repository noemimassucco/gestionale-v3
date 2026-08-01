'use strict';
// ═══════ NOTIFICHE PERSONALI ("Per te") ═══════
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

// Le mie notifiche: non lette + ultime lette (per il popup)
router.get('/api/mie-notifiche', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT id, tipo, titolo, testo, link, letto, created_at
      FROM notifiche_utente WHERE user_id=$1
      ORDER BY letto ASC, id DESC LIMIT 30`, [req.user.id]);
    res.json({ count: r.rows.filter(n => !n.letto).length, notifiche: r.rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/api/mie-notifiche/lette', authMiddleware, async (req, res) => {
  try {
    await pool.query('UPDATE notifiche_utente SET letto=true WHERE user_id=$1 AND letto=false', [req.user.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/api/mie-notifiche/:id/letta', authMiddleware, async (req, res) => {
  try {
    await pool.query('UPDATE notifiche_utente SET letto=true WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
