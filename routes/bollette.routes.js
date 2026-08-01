'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const upload = require('../middleware/upload');

// ── Cloudinary v2 ──
const cloudinary = require('cloudinary').v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

router.get('/api/bollette', authMiddleware, async (req, res) => {
  const { sub_id, tipo, stato } = req.query;
  let where=['1=1'],params=[],p=1;
  if(sub_id){where.push(`b.sub_id=$${p++}`);params.push(sub_id);}
  if(tipo){where.push(`b.tipo=$${p++}`);params.push(tipo);}
  if(stato){where.push(`b.stato=$${p++}`);params.push(stato);}
  const r = await pool.query(`
    SELECT b.*,s.codice as sub_codice,sd.nome as sede_nome,(b.scadenza-CURRENT_DATE) as giorni_scadenza
    FROM bollette b LEFT JOIN subs s ON b.sub_id=s.id LEFT JOIN sedi sd ON s.sede_id=sd.id
    WHERE ${where.join(' AND ')} ORDER BY b.scadenza ASC NULLS LAST`,params);
  res.json(r.rows);
});

router.post('/api/bollette', authMiddleware, upload.single('file'), async (req, res) => {
  const f = req.body;
  const { sub_id } = f;
  // ── Blocco sicurezza: SUB deve essere attivo ──────────────
  if (sub_id) {
    const subCheck = await pool.query('SELECT stato_sub FROM subs WHERE id=$1', [sub_id]);
    if (subCheck.rows.length && subCheck.rows[0].stato_sub && subCheck.rows[0].stato_sub !== 'attivo') {
      return res.status(400).json({ error: `SUB non attivo (stato: ${subCheck.rows[0].stato_sub}) — operazione non consentita` });
    }
  }
  let url=null,cloudinary_id=null,salvaInDb=false;
  if(req.file){
    if(process.env.CLOUDINARY_CLOUD_NAME){
      try{
        const b64=`data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        const result=await cloudinary.uploader.upload(b64,{folder:'gestionale-bollette',resource_type:'auto'});
        url=result.secure_url;cloudinary_id=result.public_id;
      }catch(cldErr){ console.error('⚠️ Cloudinary fallito (bolletta), salvo nel DB:', cldErr.message); salvaInDb=true; }
    } else salvaInDb=true;
  }
  const r = await pool.query(
    `INSERT INTO bollette (sub_id,tipo,fornitore_nome,numero,importo,periodo_dal,periodo_al,scadenza,data_pagamento,stato,url,cloudinary_id,note,created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [f.sub_id||null,f.tipo||'altro',f.fornitore_nome||null,f.numero||null,f.importo||null,
     f.periodo_dal||null,f.periodo_al||null,f.scadenza||null,f.data_pagamento||null,
     f.stato||'da_pagare',url,cloudinary_id,f.note||null,req.user.id]);
  if(salvaInDb && req.file){
    await pool.query('INSERT INTO bollette_files (bolletta_id,mime,size,data) VALUES ($1,$2,$3,$4)',
      [r.rows[0].id, req.file.mimetype, req.file.size, req.file.buffer]);
    const fUrl='/api/bollette/'+r.rows[0].id+'/file';
    await pool.query('UPDATE bollette SET url=$1 WHERE id=$2',[fUrl,r.rows[0].id]);
    r.rows[0].url=fUrl;
  }
  if(f.sub_id) await pool.query('INSERT INTO sub_storia (sub_id,tipo,titolo,descrizione,created_by) VALUES ($1,$2,$3,$4,$5)',
    [f.sub_id,'bolletta',`Bolletta ${f.tipo||'altro'} ${f.fornitore_nome||''}`,`€ ${f.importo||'—'} — Scadenza: ${f.scadenza||'—'}`,req.user.id]);
  res.json(r.rows[0]);
});

router.put('/api/bollette/:id', authMiddleware, async (req, res) => {
  const f=req.body;
  const r=await pool.query(
    `UPDATE bollette SET tipo=COALESCE($1,tipo),fornitore_nome=COALESCE($2,fornitore_nome),numero=COALESCE($3,numero),importo=COALESCE($4::numeric,importo),periodo_dal=COALESCE($5::date,periodo_dal),periodo_al=COALESCE($6::date,periodo_al),scadenza=COALESCE($7::date,scadenza),data_pagamento=COALESCE($8::date,data_pagamento),stato=COALESCE($9,stato),note=COALESCE($10,note) WHERE id=$11 RETURNING *`,
    [f.tipo||null,f.fornitore_nome||null,f.numero||null,f.importo||null,f.periodo_dal||null,f.periodo_al||null,f.scadenza||null,f.data_pagamento||null,f.stato||null,f.note||null,req.params.id]);
  res.json(r.rows[0]);
});

router.get('/api/bollette/:id/file', async (req, res) => {
  try {
    const jwt=require('jsonwebtoken');
    const { JWT_SECRET }=require('../middleware/auth');
    const tok=(req.headers.authorization||'').replace('Bearer ','')||req.query.token||'';
    try{ jwt.verify(tok, JWT_SECRET); }catch{ return res.status(401).json({error:'Non autorizzato'}); }
    const r=await pool.query('SELECT mime,data FROM bollette_files WHERE bolletta_id=$1',[req.params.id]);
    if(!r.rows.length) return res.status(404).json({error:'File non trovato'});
    res.setHeader('Content-Type',r.rows[0].mime||'application/octet-stream');
    res.setHeader('Content-Disposition','inline; filename="bolletta"');
    res.send(r.rows[0].data);
  } catch(e){ res.status(500).json({error:e.message}); }
});

router.delete('/api/bollette/:id', authMiddleware, async (req, res) => {
  await pool.query('DELETE FROM bollette WHERE id=$1',[req.params.id]);res.json({ok:true});
});

module.exports = router;
