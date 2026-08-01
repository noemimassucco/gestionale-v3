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

router.get('/api/users', authMiddleware, async (req, res) => {
  const r = await pool.query('SELECT id,email,nome,ruolo,attivo,ultimo_accesso,created_at FROM users ORDER BY nome');
  res.json(r.rows);
});

router.post('/api/users', authMiddleware, async (req, res) => {
  const { email, password, nome, ruolo } = req.body;
  const hash = await bcrypt.hash(password, 10);
  const r = await pool.query(
    'INSERT INTO users (email,password_hash,nome,ruolo) VALUES ($1,$2,$3,$4) RETURNING id,email,nome,ruolo',
    [email, hash, nome, ruolo || 'operatore']
  );
  res.json(r.rows[0]);
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
