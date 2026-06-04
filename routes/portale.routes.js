'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { JWT_SECRET }       = require('../middleware/auth');
const { requireInquilino } = require('../middleware/portale');

// ═══════════════════════════════════════════════════════════
// POST /api/portale/login
// ═══════════════════════════════════════════════════════════
router.post('/api/portale/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e password obbligatori' });
  try {
    const r = await pool.query(
      `SELECT u.*, i.ragione_sociale AS inquilino_nome
       FROM users u
       LEFT JOIN inquilini i ON u.inquilino_id = i.id
       WHERE u.email=$1 AND u.ruolo='inquilino' AND u.attivo=true`,
      [email]
    );
    const user = r.rows[0];
    if (!user) return res.status(401).json({ error: 'Credenziali non valide' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Credenziali non valide' });

    await pool.query(`UPDATE users SET ultimo_accesso=NOW() WHERE id=$1`, [user.id]);

    const token = jwt.sign(
      { id: user.id, email: user.email, nome: user.nome,
        ruolo: 'inquilino', inquilino_id: user.inquilino_id },
      JWT_SECRET, { expiresIn: '7d' }
    );
    res.json({ token, nome: user.nome || user.inquilino_nome, inquilino_id: user.inquilino_id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// GET /api/portale/me
// ═══════════════════════════════════════════════════════════
router.get('/api/portale/me', requireInquilino, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT u.id, u.email, u.nome, u.ultimo_accesso,
              i.id AS inquilino_id, i.ragione_sociale, i.tel, i.email AS inq_email
       FROM users u LEFT JOIN inquilini i ON u.inquilino_id=i.id
       WHERE u.id=$1`,
      [req.user.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Non trovato' });
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// GET /api/portale/miei-sub — SUB dell'inquilino loggato
// ═══════════════════════════════════════════════════════════
router.get('/api/portale/miei-sub', requireInquilino, async (req, res) => {
  const inqId = req.user.inquilino_id;
  try {
    const r = await pool.query(`
      SELECT s.id, s.codice, s.piano, s.indirizzo_completo,
             s.stato_occupazione, s.canone_annuo, s.tipo_contratto,
             s.data_inizio_contratto, s.classe_energetica,
             s.mq_commerciali, s.mq_calpestabili,
             sd.nome AS sede_nome, sd.citta AS sede_citta
      FROM subs s
      LEFT JOIN sedi sd ON s.sede_id = sd.id
      WHERE s.inquilino_id = $1
        AND (s.stato_sub IS NULL OR s.stato_sub = 'attivo')
      ORDER BY sd.nome, s.codice
    `, [inqId]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// GET /api/portale/pagamenti — pagamenti affitto del mio sub
// ═══════════════════════════════════════════════════════════
router.get('/api/portale/pagamenti', requireInquilino, async (req, res) => {
  const inqId = req.user.inquilino_id;
  try {
    const r = await pool.query(`
      SELECT p.*, s.codice AS sub_codice, sd.nome AS sede_nome
      FROM pagamenti_affitto p
      JOIN subs s  ON p.sub_id = s.id
      JOIN sedi sd ON s.sede_id = sd.id
      WHERE p.inquilino_id = $1
      ORDER BY p.anno DESC, p.mese DESC
      LIMIT 48
    `, [inqId]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// GET /api/portale/bollette — bollette dei miei sub
// ═══════════════════════════════════════════════════════════
router.get('/api/portale/bollette', requireInquilino, async (req, res) => {
  const inqId = req.user.inquilino_id;
  try {
    const r = await pool.query(`
      SELECT b.*, s.codice AS sub_codice, sd.nome AS sede_nome
      FROM bollette b
      JOIN subs s  ON b.sub_id = s.id
      JOIN sedi sd ON s.sede_id = sd.id
      WHERE s.inquilino_id = $1
      ORDER BY b.scadenza DESC NULLS LAST
      LIMIT 50
    `, [inqId]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// GET /api/portale/documenti — documenti dei miei sub
// ═══════════════════════════════════════════════════════════
router.get('/api/portale/documenti', requireInquilino, async (req, res) => {
  const inqId = req.user.inquilino_id;
  try {
    const r = await pool.query(`
      SELECT d.id, d.nome, d.tipo, d.url, d.data_documento, d.scadenza, d.importo
      FROM documenti d
      JOIN subs s ON d.sub_id = s.id
      WHERE s.inquilino_id = $1
        AND d.url IS NOT NULL
      ORDER BY d.data_documento DESC NULLS LAST
      LIMIT 50
    `, [inqId]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// GET /api/portale/ticket — solo i ticket aperti dall'inquilino
// ═══════════════════════════════════════════════════════════
router.get('/api/portale/ticket', requireInquilino, async (req, res) => {
  const inqId = req.user.inquilino_id;
  try {
    const r = await pool.query(`
      SELECT t.id, t.titolo, t.descrizione, t.categoria,
             t.priorita, t.stato, t.created_at, t.data_chiusura,
             s.codice AS sub_codice, sd.nome AS sede_nome
      FROM ticket t
      JOIN subs s  ON t.sub_id = s.id
      JOIN sedi sd ON s.sede_id = sd.id
      WHERE t.inquilino_id = $1
      ORDER BY t.created_at DESC
    `, [inqId]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// POST /api/portale/ticket — crea ticket (solo per i propri sub)
// ═══════════════════════════════════════════════════════════
router.post('/api/portale/ticket', requireInquilino, async (req, res) => {
  const inqId = req.user.inquilino_id;
  const { sub_id, titolo, descrizione, categoria, priorita } = req.body;
  if (!titolo) return res.status(400).json({ error: 'Titolo obbligatorio' });

  // Verifica che il sub appartenga all'inquilino (anti-IDOR)
  if (sub_id) {
    const check = await pool.query(
      `SELECT id FROM subs WHERE id=$1 AND inquilino_id=$2`, [sub_id, inqId]
    );
    if (!check.rows.length) {
      return res.status(403).json({ error: 'SUB non appartiene all\'inquilino' });
    }
  }

  try {
    const r = await pool.query(`
      INSERT INTO ticket (sub_id, inquilino_id, titolo, descrizione, categoria, priorita, stato)
      VALUES ($1,$2,$3,$4,$5,$6,'aperto')
      RETURNING *
    `, [sub_id||null, inqId, titolo, descrizione||null, categoria||null, priorita||'normale']);
    res.status(201).json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
