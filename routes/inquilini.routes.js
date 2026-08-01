'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

router.get('/api/inquilini', authMiddleware, async (req, res) => {
  const r = await pool.query('SELECT * FROM inquilini ORDER BY ragione_sociale');
  res.json(r.rows);
});

router.post('/api/inquilini', authMiddleware, async (req, res) => {
  const i = req.body;
  const r = await pool.query(
    'INSERT INTO inquilini (codice_zuc,ragione_sociale,piva,cf,indirizzo,cap,citta,provincia,tel,email) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
    [i.codice_zuc||null,i.ragione_sociale,i.piva||null,i.cf||null,i.indirizzo||null,i.cap||null,i.citta||null,i.provincia||null,i.tel||null,i.email||null]
  );
  res.json(r.rows[0]);
});

router.put('/api/inquilini/:id', authMiddleware, async (req, res) => {
  const i = req.body;
  const r = await pool.query(
    'UPDATE inquilini SET codice_zuc=$1,ragione_sociale=$2,piva=$3,cf=$4,indirizzo=$5,cap=$6,citta=$7,provincia=$8,tel=$9,email=$10 WHERE id=$11 RETURNING *',
    [i.codice_zuc||null,i.ragione_sociale,i.piva||null,i.cf||null,i.indirizzo||null,i.cap||null,i.citta||null,i.provincia||null,i.tel||null,i.email||null,req.params.id]
  );
  res.json(r.rows[0]);
});

router.delete('/api/inquilini/:id', authMiddleware, async (req, res) => {
  const cl=await pool.connect();
  try{
    await cl.query('BEGIN');
    const id=req.params.id;
    await cl.query('UPDATE subs SET inquilino_id=NULL WHERE inquilino_id=$1',[id]);
    await cl.query('UPDATE interventi SET inquilino_id=NULL WHERE inquilino_id=$1',[id]);
    await cl.query('DELETE FROM storico_inquilini WHERE inquilino_id=$1',[id]);
    await cl.query('UPDATE pagamenti_affitto SET inquilino_id=NULL WHERE inquilino_id=$1',[id]);
    await cl.query('UPDATE ticket SET inquilino_id=NULL WHERE inquilino_id=$1',[id]);
    await cl.query('UPDATE ordini_fatturazione SET inquilino_id=NULL WHERE inquilino_id=$1',[id]);
    await cl.query('DELETE FROM inquilini WHERE id=$1',[id]);
    await cl.query('COMMIT');
    res.json({ok:true});
  }catch(e){await cl.query('ROLLBACK');res.status(500).json({error:e.message});}
  finally{cl.release();}
});

router.post('/api/inquilini/import-bulk', authMiddleware, async (req, res) => {
  const items = req.body.rows || req.body.items || [];
  if(!items.length) return res.json({added:0,skipped:0,errors:[]});
  const cl=await pool.connect();
  let added=0,skipped=0,errors=[];
  try{
    await cl.query('BEGIN');
    const existing=(await cl.query('SELECT LOWER(TRIM(ragione_sociale)) as n FROM inquilini')).rows.map(r=>r.n);
    for(const f of items){
      try{
        const rag=(f.ragione_sociale||f['Ragione Sociale']||f['Ragione Sociale / Nome Cognome']||'').trim();
        if(!rag){skipped++;continue;}
        if(existing.includes(rag.toLowerCase())){skipped++;continue;}
        await cl.query(
          'INSERT INTO inquilini (codice_zuc,ragione_sociale,piva,cf,indirizzo,cap,citta,provincia,tel,email) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
          [f.codice_zuc||f['Codice']||null,rag,
           f.piva||f['Partita IVA']||f.partita_iva||null,
           f.cf||f['Codice Fiscale']||null,
           f.indirizzo||f['Indirizzo']||null,
           f.cap||f['CAP']||null,
           f.citta||f['Città']||f.citta||null,
           f.provincia||f['Provincia']||null,
           f.tel||f['Telefono']||null,
           f.email||f['Email']||null]);
        existing.push(rag.toLowerCase());
        added++;
      }catch(e){errors.push({row:f.ragione_sociale||'?',error:e.message});}
    }
    await cl.query('COMMIT');
    res.json({added,skipped,errors});
  }catch(e){await cl.query('ROLLBACK');res.status(500).json({error:e.message});}
  finally{cl.release();}
});

module.exports = router;

// ── POST /api/inquilini/:id/crea-accesso ────────────────────
// Crea un utente con ruolo='inquilino' per l'anagrafica indicata.
// Body: { email, password } — richiede admin
router.post('/api/inquilini/:id/crea-accesso', authMiddleware, async (req, res) => {
  if (req.user?.ruolo !== 'admin') return res.status(403).json({ error: 'Solo admin' });
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e password obbligatori' });
  if (password.length < 6) return res.status(400).json({ error: 'Password minimo 6 caratteri' });

  const bcrypt = require('bcryptjs');
  try {
    // Verifica che l'inquilino esista
    const inq = await pool.query('SELECT id, ragione_sociale FROM inquilini WHERE id=$1', [req.params.id]);
    if (!inq.rows.length) return res.status(404).json({ error: 'Inquilino non trovato' });

    // Verifica email non già usata
    const dup = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (dup.rows.length) return res.status(409).json({ error: 'Email già registrata' });

    const hash = await bcrypt.hash(password, 10);
    const r = await pool.query(`
      INSERT INTO users (email, password_hash, nome, ruolo, inquilino_id)
      VALUES ($1,$2,$3,'inquilino',$4)
      RETURNING id, email, nome, ruolo, inquilino_id
    `, [email, hash, inq.rows[0].ragione_sociale, req.params.id]);

    res.status(201).json({ user: r.rows[0], portale_url: '/portale.html' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
