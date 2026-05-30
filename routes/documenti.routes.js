'use strict';
const router = require('express').Router();
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { updateSaluteImmobile, generateTags, extractPriceFromText, parseDate, parsePrice, normalizeStr } = require('../utils/helpers');


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
  let url = null, cloudinary_id = null;
  if (req.file) {
    if (process.env.CLOUDINARY_CLOUD_NAME) {
      const b64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
      const result = await cloudinary.uploader.upload(b64, { folder: 'gestionale-documenti', resource_type: 'auto' });
      url = result.secure_url; cloudinary_id = result.public_id;
    } else {
      url = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
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
  if (sub_id) {
    await pool.query('INSERT INTO sub_storia (sub_id,tipo,titolo,descrizione,created_by) VALUES ($1,$2,$3,$4,$5)',
      [sub_id,'documento',`Nuovo documento: ${nomeFile}`,`Tipo: ${tipo||'documento'}`,req.user.id]);
  }
  res.json(r.rows[0]);
});

router.delete('/api/documenti/:id', authMiddleware, async (req, res) => {
  const r = await pool.query('SELECT cloudinary_id FROM documenti WHERE id=$1', [req.params.id]);
  if (r.rows[0]?.cloudinary_id && process.env.CLOUDINARY_CLOUD_NAME) {
    try { await cloudinary.uploader.destroy(r.rows[0].cloudinary_id, { resource_type: 'raw' }); } catch(e) {}
  }
  await pool.query('DELETE FROM documenti WHERE id=$1', [req.params.id]);
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
