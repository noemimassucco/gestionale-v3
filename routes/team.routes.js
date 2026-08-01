'use strict';
// ═══════ CHAT INTERNA TRA DIPENDENTI ═══════
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const { smtpConfigured, sendMail } = require('../utils/mailer');

// Trova gli utenti taggati con @Nome (o @parte-email) nel testo
function trovaMenzioni(testo, utenti, autoreId) {
  const t = String(testo).toLowerCase();
  return utenti.filter(u => {
    if (u.id === autoreId || u.attivo === false) return false;
    const candidati = [];
    if (u.nome) {
      candidati.push(u.nome);                      // @Maria Rossi
      candidati.push(u.nome.split(/\s+/)[0]);      // @Maria
    }
    if (u.email) candidati.push(u.email.split('@')[0]); // @maria.rossi
    return candidati.some(c => c && t.includes('@' + c.toLowerCase()));
  });
}

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
    const msg = r.rows[0];

    // ── MENZIONI: se il testo contiene @Nome, crea la notifica per quell'utente ──
    if (testo.includes('@')) {
      try {
        const ur = await pool.query('SELECT id, nome, email, attivo FROM users');
        const taggati = trovaMenzioni(testo, ur.rows, req.user.id);
        for (const u of taggati) {
          await pool.query('INSERT INTO team_menzioni (user_id, messaggio_id) VALUES ($1,$2)', [u.id, msg.id]);
        }
        // Email (solo se SMTP configurato) — best effort, non blocca il messaggio
        if (taggati.length && smtpConfigured()) {
          const autore = req.user.nome || req.user.email;
          taggati.forEach(u => {
            if (!u.email) return;
            sendMail({
              to: u.email,
              subject: `💬 ${autore} ti ha menzionato nella Chat Team`,
              html: `<p><b>${autore}</b> ti ha menzionato:</p><blockquote style="border-left:3px solid #c2542e;margin:8px 0;padding:6px 12px;background:#f7f3ea;">${String(testo).replace(/</g,'&lt;')}</blockquote><p>Apri il gestionale → Chat Team per rispondere.</p>`,
            }).catch(err => console.warn('[team-chat] email menzione fallita:', err.message));
          });
        }
      } catch(e2) { console.warn('[team-chat] menzioni non salvate:', e2.message); }
    }
    res.json(msg);
  } catch(e) { console.error('POST /api/team-chat:', e.message); res.status(500).json({ error: e.message }); }
});

// Menzioni NON lette dell'utente corrente (per badge + notifica)
router.get('/api/team-chat/menzioni', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT tm.id, tm.messaggio_id, tm.created_at, m.testo,
             COALESCE(u.nome, u.email, 'Utente') AS autore
      FROM team_menzioni tm
      JOIN team_messaggi m ON tm.messaggio_id = m.id
      LEFT JOIN users u ON m.user_id = u.id
      WHERE tm.user_id = $1 AND tm.letto = false
      ORDER BY tm.id DESC LIMIT 20`, [req.user.id]);
    res.json({ count: r.rows.length, menzioni: r.rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Segna tutte le menzioni come lette (quando apro la Chat Team)
router.post('/api/team-chat/menzioni/lette', authMiddleware, async (req, res) => {
  try {
    await pool.query('UPDATE team_menzioni SET letto=true WHERE user_id=$1 AND letto=false', [req.user.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
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
