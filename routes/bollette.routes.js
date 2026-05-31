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
  // ── Blocco sicurezza: SUB deve essere attivo ──────────────
  if (sub_id) {
    const subCheck = await pool.query('SELECT stato_sub FROM subs WHERE id=$1', [sub_id]);
    if (subCheck.rows.length && subCheck.rows[0].stato_sub && subCheck.rows[0].stato_sub !== 'attivo') {
      return res.status(400).json({ error: `SUB non attivo (stato: ${subCheck.rows[0].stato_sub}) — operazione non consentita` });
    }
  }
  const f = req.body;
  let url=null,cloudinary_id=null;
  if(req.file){
    if(process.env.CLOUDINARY_CLOUD_NAME){
      const b64=`data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
      const result=await cloudinary.uploader.upload(b64,{folder:'gestionale-bollette',resource_type:'auto'});
      url=result.secure_url;cloudinary_id=result.public_id;
    }
  }
  const r = await pool.query(
    `INSERT INTO bollette (sub_id,tipo,fornitore_nome,numero,importo,periodo_dal,periodo_al,scadenza,data_pagamento,stato,url,cloudinary_id,note,created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [f.sub_id||null,f.tipo||'altro',f.fornitore_nome||null,f.numero||null,f.importo||null,
     f.periodo_dal||null,f.periodo_al||null,f.scadenza||null,f.data_pagamento||null,
     f.stato||'da_pagare',url,cloudinary_id,f.note||null,req.user.id]);
  if(f.sub_id) await pool.query('INSERT INTO sub_storia (sub_id,tipo,titolo,descrizione,created_by) VALUES ($1,$2,$3,$4,$5)',
    [f.sub_id,'bolletta',`Bolletta ${f.tipo||'altro'} ${f.fornitore_nome||''}`,`€ ${f.importo||'—'} — Scadenza: ${f.scadenza||'—'}`,req.user.id]);
  res.json(r.rows[0]);
});

router.put('/api/bollette/:id', authMiddleware, async (req, res) => {
  const f=req.body;
  const r=await pool.query(
    'UPDATE bollette SET tipo=$1,fornitore_nome=$2,numero=$3,importo=$4,periodo_dal=$5,periodo_al=$6,scadenza=$7,data_pagamento=$8,stato=$9,note=$10 WHERE id=$11 RETURNING *',
    [f.tipo,f.fornitore_nome||null,f.numero||null,f.importo||null,f.periodo_dal||null,f.periodo_al||null,f.scadenza||null,f.data_pagamento||null,f.stato||'da_pagare',f.note||null,req.params.id]);
  res.json(r.rows[0]);
});

router.delete('/api/bollette/:id', authMiddleware, async (req, res) => {
  await pool.query('DELETE FROM bollette WHERE id=$1',[req.params.id]);res.json({ok:true});
});

module.exports = router;
