'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { registraUscita, rimuoviUscita } = require('../utils/controlloFatturazione');

// ── Cloudinary v2 ──
const cloudinary = require('cloudinary').v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

router.get('/api/documenti', authMiddleware, async (req, res) => {
  const { sub_id, sede_id, tipo, search } = req.query;
  let where = ['1=1'], params = [], p = 1;
  if (sub_id) { where.push(`d.sub_id=$${p++}`); params.push(sub_id); }
  if (sede_id) { where.push(`d.sede_id=$${p++}`); params.push(sede_id); }
  if (tipo) { where.push(`d.tipo=$${p++}`); params.push(tipo); }
  if (search) { where.push(`(d.nome ILIKE $${p} OR d.descrizione ILIKE $${p})`); params.push(`%${search}%`); p++; }
  const r = await pool.query(`
    SELECT d.*,s.codice as sub_codice,sd.nome as sede_nome,f.ragione_sociale as fornitore_nome,u.nome as autore
    FROM documenti d
    LEFT JOIN subs s ON d.sub_id=s.id LEFT JOIN sedi sd ON d.sede_id=sd.id
    LEFT JOIN fornitori f ON d.fornitore_id=f.id LEFT JOIN users u ON d.created_by=u.id
    WHERE ${where.join(' AND ')} ORDER BY d.created_at DESC`, params);
  res.json(r.rows);
});

router.post('/api/documenti', authMiddleware, upload.single('file'), async (req, res) => {
  const { sub_id, sede_id, fornitore_id, tipo, nome, data_documento, scadenza, importo, descrizione, note } = req.body;
  let url = null, cloudinary_id = null, salvaInDb = false;
  if (req.file) {
    if (process.env.CLOUDINARY_CLOUD_NAME) {
      try {
        const b64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        const result = await cloudinary.uploader.upload(b64, { folder: 'gestionale-documenti', resource_type: 'auto' });
        url = result.secure_url; cloudinary_id = result.public_id;
      } catch(cldErr) {
        console.error('⚠️ Cloudinary fallito, salvo nel DB:', cldErr.message);
        salvaInDb = true; // piano B: il file non si perde mai
      }
    } else {
      salvaInDb = true; // file conservato nel database (tabella documenti_files)
    }
  }
  const nomeFile = nome || req.file?.originalname || 'Documento';
  const tags = [];
  if (tipo === 'fattura') tags.push('fattura');
  if (tipo === 'contratto') tags.push('contratto');
  if (scadenza) tags.push('con-scadenza');
  const r = await pool.query(
    'INSERT INTO documenti (sub_id,sede_id,fornitore_id,tipo,nome,url,cloudinary_id,data_documento,scadenza,importo,descrizione,note,tags,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *',
    [sub_id||null,sede_id||null,fornitore_id||null,tipo||'documento',nomeFile,url,cloudinary_id,data_documento||null,scadenza||null,importo||null,descrizione||null,note||null,tags,req.user.id]
  );
  if (salvaInDb && req.file) {
    await pool.query('INSERT INTO documenti_files (documento_id,mime,size,data) VALUES ($1,$2,$3,$4)',
      [r.rows[0].id, req.file.mimetype, req.file.size, req.file.buffer]);
    const fileUrl = '/api/documenti/' + r.rows[0].id + '/file';
    await pool.query('UPDATE documenti SET url=$1 WHERE id=$2', [fileUrl, r.rows[0].id]);
    r.rows[0].url = fileUrl;
  }
  if (sub_id) {
    await pool.query('INSERT INTO sub_storia (sub_id,tipo,titolo,descrizione,created_by) VALUES ($1,$2,$3,$4,$5)',
      [sub_id,'documento',`Nuovo documento: ${nomeFile}`,`Tipo: ${tipo||'documento'}`,req.user.id]);
  }
  if (importo) {
    let fornNome = null;
    if (fornitore_id) { const fr = await pool.query('SELECT ragione_sociale FROM fornitori WHERE id=$1', [fornitore_id]).catch(()=>null); fornNome = fr?.rows[0]?.ragione_sociale || null; }
    await registraUscita(pool, { origine_tipo:'documento', origine_id:r.rows[0].id, sub_id:sub_id||null, sede_id:sede_id||null,
      fornitore_nome:fornNome, descrizione:descrizione||nomeFile, importo, data_documento:data_documento||null, created_by:req.user.id });
  }
  res.json(r.rows[0]);
});

// Serve il file salvato nel database. Il token può arrivare in query (?token=)
// perché i link <a href> non possono mandare header.
router.get('/api/documenti/:id/file', async (req, res) => {
  try {
    const jwt = require('jsonwebtoken');
    const { JWT_SECRET } = require('../middleware/auth');
    const tok = (req.headers.authorization||'').replace('Bearer ','') || req.query.token || '';
    try { jwt.verify(tok, JWT_SECRET); } catch { return res.status(401).json({ error: 'Non autorizzato' }); }
    const r = await pool.query(
      `SELECT f.mime, f.data, d.nome FROM documenti_files f JOIN documenti d ON d.id=f.documento_id WHERE f.documento_id=$1`,
      [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'File non trovato' });
    const row = r.rows[0];
    res.setHeader('Content-Type', row.mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline; filename="' + encodeURIComponent(row.nome||'documento') + '"');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(row.data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/api/documenti/:id', authMiddleware, async (req, res) => {
  const r = await pool.query('SELECT cloudinary_id FROM documenti WHERE id=$1', [req.params.id]);
  if (r.rows[0]?.cloudinary_id && process.env.CLOUDINARY_CLOUD_NAME) {
    // L'upload usa resource_type:'auto', e Cloudinary classifica i PDF come 'image' (non 'raw') —
    // cancellare sempre con resource_type:'raw' falliva silenzioso per la maggior parte dei
    // documenti (PDF/immagini), lasciando il file online a consumare spazio anche dopo
    // l'eliminazione dall'app. Si prova ogni tipo finché uno non riesce davvero.
    for (const resourceType of ['image', 'raw', 'video']) {
      try {
        const result = await cloudinary.uploader.destroy(r.rows[0].cloudinary_id, { resource_type: resourceType });
        if (result?.result === 'ok') break;
      } catch(e) {}
    }
  }
  await pool.query('DELETE FROM documenti WHERE id=$1', [req.params.id]);
  await rimuoviUscita(pool, 'documento', req.params.id);
  res.json({ ok: true });
});

router.get('/api/documenti/scadenze', authMiddleware, async (req, res) => {
  const r = await pool.query(`
    SELECT d.*,s.codice as sub_codice,sd.nome as sede_nome,
      (d.scadenza - CURRENT_DATE) as giorni_scadenza
    FROM documenti d
    LEFT JOIN subs s ON d.sub_id=s.id LEFT JOIN sedi sd ON d.sede_id=sd.id
    WHERE d.scadenza IS NOT NULL AND d.scadenza >= CURRENT_DATE
    ORDER BY d.scadenza ASC LIMIT 20`);
  res.json(r.rows);
});

router.post('/api/allegati', authMiddleware, upload.single('file'), async (req, res) => {
  const { intervento_id, tipo } = req.body;
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Nessun file' });

  try {
    let url, cloudinary_id;
    if (process.env.CLOUDINARY_CLOUD_NAME) {
      const b64 = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
      const result = await cloudinary.uploader.upload(b64, {
        folder: 'gestionale-immobili',
        resource_type: 'auto'
      });
      url = result.secure_url;
      cloudinary_id = result.public_id;
    } else {
      // Fallback: base64 nel DB (solo sviluppo)
      url = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
      cloudinary_id = null;
    }
    const r = await pool.query(
      'INSERT INTO allegati (intervento_id,tipo,nome,url,cloudinary_id,dimensione,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [intervento_id, tipo || 'documento', file.originalname, url, cloudinary_id, file.size, req.user.id]
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/api/allegati/:id', authMiddleware, async (req, res) => {
  const r = await pool.query('SELECT cloudinary_id FROM allegati WHERE id=$1', [req.params.id]);
  if (r.rows[0]?.cloudinary_id && process.env.CLOUDINARY_CLOUD_NAME) {
    try { await cloudinary.uploader.destroy(r.rows[0].cloudinary_id); } catch(e) {}
  }
  await pool.query('DELETE FROM allegati WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
