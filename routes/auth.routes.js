'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authMiddleware, JWT_SECRET } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');

router.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const r = await pool.query('SELECT * FROM users WHERE email=$1 AND attivo=true', [email]);
    if (!r.rows.length) return res.status(401).json({ error: 'Email o password errati' });
    const user = r.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Email o password errati' });
    await pool.query('UPDATE users SET ultimo_accesso=NOW() WHERE id=$1', [user.id]);
    const token = jwt.sign({ id: user.id, email: user.email, nome: user.nome, ruolo: user.ruolo }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email, nome: user.nome, ruolo: user.ruolo } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/api/auth/me', authMiddleware, async (req, res) => {
  const r = await pool.query('SELECT id,email,nome,ruolo,ultimo_accesso FROM users WHERE id=$1', [req.user.id]);
  res.json(r.rows[0]);
});

router.post('/api/auth/change-password', authMiddleware, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const r = await pool.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
  if (!r.rows.length || !(await bcrypt.compare(oldPassword, r.rows[0].password_hash)))
    return res.status(401).json({ error: 'Password attuale errata' });
  const hash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, req.user.id]);
  res.json({ ok: true });
});

// ── PASSWORD DIMENTICATA: invia una password temporanea via email ──
router.post('/api/auth/forgot', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'Inserisci la tua email' });
  try {
    const { smtpConfigured, sendMail } = require('../utils/mailer');
    if (!smtpConfigured())
      return res.status(400).json({ error: 'Recupero via email non attivo: chiedi all\'amministratore di reimpostare la password' });
    const r = await pool.query('SELECT id, nome FROM users WHERE LOWER(email)=$1 AND attivo=true', [email]);
    // Risposta identica anche se l'utente non esiste (non riveliamo gli account)
    if (r.rows.length) {
      const tmp = 'Gest-' + Math.random().toString(36).slice(2, 8) + Math.floor(Math.random() * 90 + 10);
      const hash = await bcrypt.hash(tmp, 10);
      await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, r.rows[0].id]);
      const mr = await sendMail({
        to: email,
        subject: '🔑 Password temporanea — Gestionale Immobili',
        html: `<p>Ciao ${r.rows[0].nome || ''},</p><p>la tua nuova password temporanea è:</p><p style="font-size:20px;font-weight:700;font-family:monospace;background:#f7f3ea;padding:10px 16px;border-radius:8px;display:inline-block;">${tmp}</p><p>Accedi e cambiala subito da <b>Impostazioni → Cambia password</b>.</p>`,
      });
      if (mr.error) return res.status(500).json({ error: 'Invio email fallito: ' + mr.error });
    }
    res.json({ ok: true, msg: 'Se l\'email è registrata, riceverai una password temporanea' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/api/users', authMiddleware, async (req, res) => {
  const r = await pool.query('SELECT id,email,nome,ruolo,attivo,ultimo_accesso,created_at FROM users ORDER BY nome');
  res.json(r.rows);
});

router.post('/api/users', authMiddleware, async (req, res) => {
  if ((req.user.ruolo || '') !== 'admin')
    return res.status(403).json({ error: 'Solo un admin può creare utenti' });
  const { email, password, nome, ruolo } = req.body;
  if (!email || !password || !nome) return res.status(400).json({ error: 'Nome, email e password obbligatori' });
  if (String(password).length < 6) return res.status(400).json({ error: 'Password troppo corta (min 6 caratteri)' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const r = await pool.query(
      'INSERT INTO users (email,password_hash,nome,ruolo) VALUES ($1,$2,$3,$4) RETURNING id,email,nome,ruolo',
      [String(email).trim().toLowerCase(), hash, nome, ruolo || 'operatore']
    );
    res.json(r.rows[0]);
  } catch(e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Esiste già un utente con questa email' });
    res.status(500).json({ error: e.message });
  }
});

// Reset password di un utente (solo admin) — utile finché l'email non è configurata
router.post('/api/users/:id/password', authMiddleware, async (req, res) => {
  if ((req.user.ruolo || '') !== 'admin')
    return res.status(403).json({ error: 'Solo un admin può reimpostare le password' });
  const { password } = req.body;
  if (!password || String(password).length < 6) return res.status(400).json({ error: 'Password troppo corta (min 6 caratteri)' });
  const hash = await bcrypt.hash(password, 10);
  const r = await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2 RETURNING id', [hash, req.params.id]);
  if (!r.rows.length) return res.status(404).json({ error: 'Utente non trovato' });
  res.json({ ok: true });
});

router.put('/api/users/:id', authMiddleware, async (req, res) => {
  const { nome, ruolo, attivo } = req.body;
  const r = await pool.query('UPDATE users SET nome=$1,ruolo=$2,attivo=$3 WHERE id=$4 RETURNING *', [nome, ruolo, attivo, req.params.id]);
  res.json(r.rows[0]);
});

router.get('/api/settings', authMiddleware, async (req, res) => {
  const r = await pool.query('SELECT cfg_key,value FROM settings');
  const obj = {};
  r.rows.forEach(row => obj[row.cfg_key] = row.value);
  res.json(obj);
});

router.post('/api/settings', authMiddleware, async (req, res) => {
  const { settings } = req.body;
  for (const [key, value] of Object.entries(settings)) {
    await pool.query(
      'INSERT INTO settings (cfg_key,value,updated_by,updated_at) VALUES ($1,$2,$3,NOW()) ON CONFLICT(cfg_key) DO UPDATE SET value=$2,updated_by=$3,updated_at=NOW()',
      [key, value, req.user.id]
    );
  }
  res.json({ ok: true });
});

module.exports = router;
