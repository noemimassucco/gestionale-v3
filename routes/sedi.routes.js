'use strict';
const router = require('express').Router();
const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authMiddleware, JWT_SECRET } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { updateSaluteImmobile, generateTags, extractPriceFromText, parseDate, parsePrice, normalizeStr } = require('../utils/helpers');


router.get('/api/sedi', authMiddleware, async (req, res) => {
  const r = await pool.query('SELECT * FROM sedi ORDER BY nome');
  res.json(r.rows);
});

router.post('/api/sedi', authMiddleware, async (req, res) => {
  const { nome, indirizzo, citta, note } = req.body;
  const r = await pool.query('INSERT INTO sedi (nome,indirizzo,citta,note) VALUES ($1,$2,$3,$4) RETURNING *', [nome, indirizzo||null, citta||null, note||null]);
  res.json(r.rows[0]);
});

router.put('/api/sedi/:id', authMiddleware, async (req, res) => {
  const { nome, indirizzo, citta, note } = req.body;
  const r = await pool.query('UPDATE sedi SET nome=$1,indirizzo=$2,citta=$3,note=$4 WHERE id=$5 RETURNING *', [nome, indirizzo||null, citta||null, note||null, req.params.id]);
  res.json(r.rows[0]);
});

router.delete('/api/sedi/:id', authMiddleware, async (req, res) => {
  await pool.query('DELETE FROM sedi WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

router.get('/api/categorie', authMiddleware, async (req, res) => {
  const r = await pool.query('SELECT * FROM categorie ORDER BY nome');
  res.json(r.rows);
});

router.post('/api/categorie', authMiddleware, async (req, res) => {
  const { nome, colore, icona } = req.body;
  const r = await pool.query('INSERT INTO categorie (nome,colore,icona) VALUES ($1,$2,$3) RETURNING *', [nome, colore||'#2563eb', icona||'🔧']);
  res.json(r.rows[0]);
});

router.put('/api/categorie/:id', authMiddleware, async (req, res) => {
  const { nome, colore, icona } = req.body;
  const r = await pool.query('UPDATE categorie SET nome=$1,colore=$2,icona=$3 WHERE id=$4 RETURNING *', [nome, colore, icona, req.params.id]);
  res.json(r.rows[0]);
});

router.delete('/api/categorie/:id', authMiddleware, async (req, res) => {
  await pool.query('DELETE FROM categorie WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
