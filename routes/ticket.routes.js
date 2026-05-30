'use strict';
const router = require('express').Router();
const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authMiddleware, JWT_SECRET } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { updateSaluteImmobile, generateTags, extractPriceFromText, parseDate, parsePrice, normalizeStr } = require('../utils/helpers');


router.get('/api/ticket', authMiddleware, async (req, res) => {
  const {sub_id,stato,priorita}=req.query;
  let where=['1=1'],params=[],p=1;
  if(sub_id){where.push(`t.sub_id=$${p++}`);params.push(sub_id);}
  if(stato){where.push(`t.stato=$${p++}`);params.push(stato);}
  if(priorita){where.push(`t.priorita=$${p++}`);params.push(priorita);}
  const r=await pool.query(`
    SELECT t.*,s.codice as sub_codice,sd.nome as sede_nome,i.ragione_sociale as inquilino_nome,
      u.nome as assegnato_nome,uc.nome as autore
    FROM ticket t LEFT JOIN subs s ON t.sub_id=s.id LEFT JOIN sedi sd ON s.sede_id=sd.id
    LEFT JOIN inquilini i ON t.inquilino_id=i.id LEFT JOIN users u ON t.assegnato_a=u.id
    LEFT JOIN users uc ON t.created_by=uc.id
    WHERE ${where.join(' AND ')} ORDER BY t.created_at DESC`,params);
  res.json(r.rows);
});

router.post('/api/ticket', authMiddleware, async (req, res) => {
  const f=req.body;
  const r=await pool.query(
    'INSERT INTO ticket (sub_id,inquilino_id,titolo,descrizione,categoria,priorita,stato,assegnato_a,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
    [f.sub_id||null,f.inquilino_id||null,f.titolo,f.descrizione||null,f.categoria||null,f.priorita||'normale',f.stato||'aperto',f.assegnato_a||null,req.user.id]);
  if(f.sub_id) await pool.query('INSERT INTO sub_storia (sub_id,tipo,titolo,descrizione,created_by) VALUES ($1,$2,$3,$4,$5)',
    [f.sub_id,'ticket',`Ticket: ${f.titolo}`,f.descrizione||'',req.user.id]);
  res.json(r.rows[0]);
});

router.put('/api/ticket/:id', authMiddleware, async (req, res) => {
  const f=req.body;
  const chiusura=f.stato==='chiuso'?'NOW()':null;
  const r=await pool.query(
    'UPDATE ticket SET titolo=$1,descrizione=$2,categoria=$3,priorita=$4,stato=$5,assegnato_a=$6,data_chiusura=COALESCE($7::TIMESTAMP,data_chiusura),updated_at=NOW() WHERE id=$8 RETURNING *',
    [f.titolo,f.descrizione||null,f.categoria||null,f.priorita||'normale',f.stato||'aperto',f.assegnato_a||null,chiusura,req.params.id]);
  res.json(r.rows[0]);
});

router.delete('/api/ticket/:id', authMiddleware, async (req, res) => {
  await pool.query('DELETE FROM ticket WHERE id=$1',[req.params.id]);res.json({ok:true});
});

module.exports = router;
