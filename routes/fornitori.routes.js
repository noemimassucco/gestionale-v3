'use strict';
const router = require('express').Router();
const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authMiddleware, JWT_SECRET } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { updateSaluteImmobile, generateTags, extractPriceFromText, parseDate, parsePrice, normalizeStr } = require('../utils/helpers');


router.get('/api/fornitori', authMiddleware, async (req, res) => {
  const r = await pool.query(`
    SELECT f.*,
      (SELECT COUNT(*) FROM interventi WHERE fornitore_id=f.id) as num_interventi,
      (SELECT COALESCE(SUM(prezzo),0) FROM interventi WHERE fornitore_id=f.id) as totale_fatturato
    FROM fornitori f ORDER BY ragione_sociale`);
  res.json(r.rows);
});

router.post('/api/fornitori', authMiddleware, async (req, res) => {
  const f = req.body;
  const r = await pool.query(
    'INSERT INTO fornitori (codice_zuc,ragione_sociale,piva,cf,indirizzo,cap,citta,provincia,tel,email,spec) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
    [f.codice_zuc||null,f.ragione_sociale,f.piva||null,f.cf||null,f.indirizzo||null,f.cap||null,f.citta||null,f.provincia||null,f.tel||null,f.email||null,f.spec||null]
  );
  res.json(r.rows[0]);
});

router.put('/api/fornitori/:id', authMiddleware, async (req, res) => {
  const f = req.body;
  const r = await pool.query(
    'UPDATE fornitori SET codice_zuc=$1,ragione_sociale=$2,piva=$3,cf=$4,indirizzo=$5,cap=$6,citta=$7,provincia=$8,tel=$9,email=$10,spec=$11 WHERE id=$12 RETURNING *',
    [f.codice_zuc||null,f.ragione_sociale,f.piva||null,f.cf||null,f.indirizzo||null,f.cap||null,f.citta||null,f.provincia||null,f.tel||null,f.email||null,f.spec||null,req.params.id]
  );
  res.json(r.rows[0]);
});

router.delete('/api/fornitori/:id', authMiddleware, async (req, res) => {
  const cl=await pool.connect();
  try{
    await cl.query('BEGIN');
    const id=req.params.id;
    await cl.query('UPDATE interventi SET fornitore_id=NULL WHERE fornitore_id=$1',[id]);
    await cl.query('UPDATE documenti SET fornitore_id=NULL WHERE fornitore_id=$1',[id]);
    await cl.query('UPDATE manutenzioni SET fornitore_id=NULL WHERE fornitore_id=$1',[id]);
    await cl.query('DELETE FROM fornitori WHERE id=$1',[id]);
    await cl.query('COMMIT');
    res.json({ok:true});
  }catch(e){await cl.query('ROLLBACK');res.status(500).json({error:e.message});}
  finally{cl.release();}
});

router.post('/api/fornitori/import-bulk', authMiddleware, async (req, res) => {
  const { items } = req.body;
  let added = 0, skipped = 0;
  for (const f of items) {
    if (!f.ragione_sociale) { skipped++; continue; }
    const ex = await pool.query('SELECT id FROM fornitori WHERE LOWER(TRIM(ragione_sociale))=LOWER(TRIM($1))', [f.ragione_sociale]);
    if (ex.rows.length) { skipped++; continue; }
    await pool.query('INSERT INTO fornitori (codice_zuc,ragione_sociale,piva,cf,indirizzo,cap,citta,provincia,tel,email) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [f.codice_zuc||null,f.ragione_sociale,f.piva||null,f.cf||null,f.indirizzo||null,f.cap||null,f.citta||null,f.provincia||null,f.tel||null,f.email||null]);
    added++;
  }
  res.json({ added, skipped });
});

module.exports = router;
