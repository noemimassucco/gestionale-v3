'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.post('/api/bulk-delete', authMiddleware, async (req, res) => {
  const { table, ids } = req.body;
  const allowed = {
    interventi:'interventi', documenti:'documenti', manutenzioni:'manutenzioni',
    subs:'subs', fornitori:'fornitori', inquilini:'inquilini',
    bollette:'bollette', ticket:'ticket', pagamenti_affitto:'pagamenti_affitto',
    ordini_fatturazione:'ordini_fatturazione',
  };
  if (!allowed[table]) return res.status(400).json({ error: 'Tabella non consentita: ' + table });
  if (!ids?.length) return res.status(400).json({ error: 'Nessun ID fornito' });
  // Validate all IDs are integers
  const intIds = ids.map(id => parseInt(id)).filter(id => !isNaN(id) && id > 0);
  if (!intIds.length) return res.status(400).json({ error: 'Nessun ID valido' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // For tables with FK deps, clear them first
    if (table === 'subs') {
      await client.query('DELETE FROM pagamenti_affitto WHERE sub_id=ANY($1)', [intIds]);
      await client.query('DELETE FROM storico_inquilini WHERE sub_id=ANY($1)', [intIds]);
      await client.query('DELETE FROM bollette WHERE sub_id=ANY($1)', [intIds]);
      await client.query('DELETE FROM ticket WHERE sub_id=ANY($1)', [intIds]);
      await client.query('DELETE FROM manutenzioni WHERE sub_id=ANY($1)', [intIds]);
      await client.query('UPDATE documenti SET sub_id=NULL WHERE sub_id=ANY($1)', [intIds]);
      await client.query('UPDATE interventi SET sub_id=NULL WHERE sub_id=ANY($1)', [intIds]);
      await client.query('DELETE FROM sub_storia WHERE sub_id=ANY($1)', [intIds]);
      await client.query('DELETE FROM sub_relazioni WHERE sub_padre=ANY($1) OR sub_figlio=ANY($1)', [intIds]);
      await client.query('UPDATE ordini_fatturazione SET sub_id=NULL WHERE sub_id=ANY($1)', [intIds]);
    }
    if (table === 'fornitori') {
      await client.query('UPDATE interventi SET fornitore_id=NULL WHERE fornitore_id=ANY($1)', [intIds]);
      await client.query('UPDATE documenti SET fornitore_id=NULL WHERE fornitore_id=ANY($1)', [intIds]);
      await client.query('UPDATE manutenzioni SET fornitore_id=NULL WHERE fornitore_id=ANY($1)', [intIds]);
    }
    if (table === 'inquilini') {
      await client.query('UPDATE subs SET inquilino_id=NULL WHERE inquilino_id=ANY($1)', [intIds]);
      await client.query('UPDATE interventi SET inquilino_id=NULL WHERE inquilino_id=ANY($1)', [intIds]);
      await client.query('DELETE FROM storico_inquilini WHERE inquilino_id=ANY($1)', [intIds]);
      await client.query('UPDATE pagamenti_affitto SET inquilino_id=NULL WHERE inquilino_id=ANY($1)', [intIds]);
      await client.query('UPDATE ticket SET inquilino_id=NULL WHERE inquilino_id=ANY($1)', [intIds]);
      await client.query('UPDATE ordini_fatturazione SET inquilino_id=NULL WHERE inquilino_id=ANY($1)', [intIds]);
    }
    const result = await client.query(`DELETE FROM ${table} WHERE id=ANY($1) RETURNING id`, [intIds]);
    await client.query('COMMIT');
    res.json({ deleted: result.rows.length, ids: result.rows.map(r => r.id) });
  } catch(e) {
    await client.query('ROLLBACK');
    console.error('Bulk delete error:', e.message);
    res.status(500).json({ error: 'Errore eliminazione: ' + e.message });
  } finally { client.release(); }
});

router.post('/api/ocr', authMiddleware, upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Nessun file' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'ANTHROPIC_API_KEY non configurata: aggiungila su Render → Environment' });
  const mimeMap = { 'image/jpeg':'image/jpeg','image/png':'image/png','image/gif':'image/gif','image/webp':'image/webp','application/pdf':'application/pdf' };
  const mediaType = mimeMap[file.mimetype] || 'image/jpeg';
  const b64 = file.buffer.toString('base64');
  try {
    const https = require('https');
    const payload = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: mediaType==='application/pdf'?'document':'image', source: { type:'base64', media_type:mediaType, data:b64 } },
          { type: 'text', text: 'Analizza questo documento (fattura, bolletta, contratto, APE, polizza, visura, verbale…) ed estrai in JSON puro senza markdown: {"tipo_documento":"uno tra: fattura|bolletta|contratto|ape|visura|planimetria|certificazione|polizza|verbale|preventivo|condominiale|altro","categoria_bolletta":"se è una bolletta, uno tra: luce|gas|acqua|internet|rifiuti|condominio|altro, altrimenti null","fornitore":"","num_fattura":"","data_fattura":"YYYY-MM-DD","periodo_dal":"YYYY-MM-DD se indicato un periodo di fornitura","periodo_al":"YYYY-MM-DD","scadenza":"YYYY-MM-DD (scadenza pagamento o validità, se presente)","importo":0,"descrizione":"breve descrizione utile come titolo"}. Se un dato manca usa null.' }
        ]
      }]
    });
    const result = await new Promise((resolve, reject) => {
      const r = https.request('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{ 'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','Content-Length':Buffer.byteLength(payload) }
      }, (resp) => { let d=''; resp.on('data',c=>d+=c); resp.on('end',()=>resolve(d)); });
      r.on('error', reject); r.write(payload); r.end();
    });
    const parsed = JSON.parse(result);
    const text = parsed.content?.[0]?.text || '{}';
    const clean = text.replace(/```json|```/g,'').trim();
    res.json({ dati: JSON.parse(clean) });
  } catch(e) { res.status(500).json({ error: 'Errore OCR: ' + e.message }); }
});

module.exports = router;
