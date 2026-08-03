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
    bollette:'bollette', pagamenti_affitto:'pagamenti_affitto',
    ordini_fatturazione:'ordini_fatturazione',
  };
  if (!allowed[table]) return res.status(400).json({ error: 'Tabella non consentita: ' + table });
  if (!ids?.length) return res.status(400).json({ error: 'Nessun ID fornito' });
  // Validate all IDs are integers
  const intIds = ids.map(id => parseInt(id)).filter(id => !isNaN(id) && id > 0);
  if (!intIds.length) return res.status(400).json({ error: 'Nessun ID valido' });

  // Tabelle le cui righe alimentano il flusso di controllo fatturazione — quando una viene
  // eliminata, la corrispondente riga di controllo va rimossa con lei (mai lasciarla orfana).
  const ORIGINE_MAP = { interventi:'intervento', documenti:'documento', manutenzioni:'manutenzione', bollette:'bolletta' };

  const client = await pool.connect();
  let idsToDelete = intIds, skippedConStorico = [];
  try {
    await client.query('BEGIN');
    // For tables with FK deps, clear them first
    if (table === 'subs') {
      // Prima bollette e pagamenti affitto (storico economico reale, spesso l'unica prova di
      // quanto incassato/pagato) venivano cancellati per sempre senza alcun avviso specifico —
      // ora un SUB che ha ancora questi dati collegati viene saltato, non cancellato in blocco.
      const conStorico = (await client.query(`
        SELECT DISTINCT sub_id FROM (
          SELECT sub_id FROM bollette WHERE sub_id=ANY($1)
          UNION SELECT sub_id FROM pagamenti_affitto WHERE sub_id=ANY($1)
        ) x WHERE sub_id IS NOT NULL`, [intIds])).rows.map(r => r.sub_id);
      skippedConStorico = conStorico;
      idsToDelete = intIds.filter(id => !conStorico.includes(id));

      if (idsToDelete.length) {
        const bollIds = (await client.query('SELECT id FROM bollette WHERE sub_id=ANY($1)', [idsToDelete])).rows.map(r => r.id);
        const manIds  = (await client.query('SELECT id FROM manutenzioni WHERE sub_id=ANY($1)', [idsToDelete])).rows.map(r => r.id);
        await client.query('DELETE FROM pagamenti_affitto WHERE sub_id=ANY($1)', [idsToDelete]);
        await client.query('DELETE FROM storico_inquilini WHERE sub_id=ANY($1)', [idsToDelete]);
        await client.query('DELETE FROM bollette WHERE sub_id=ANY($1)', [idsToDelete]);
        await client.query('DELETE FROM ticket WHERE sub_id=ANY($1)', [idsToDelete]);
        await client.query('DELETE FROM manutenzioni WHERE sub_id=ANY($1)', [idsToDelete]);
        await client.query('UPDATE documenti SET sub_id=NULL WHERE sub_id=ANY($1)', [idsToDelete]);
        await client.query('UPDATE interventi SET sub_id=NULL WHERE sub_id=ANY($1)', [idsToDelete]);
        await client.query('DELETE FROM sub_storia WHERE sub_id=ANY($1)', [idsToDelete]);
        await client.query('DELETE FROM sub_relazioni WHERE sub_padre=ANY($1) OR sub_figlio=ANY($1)', [idsToDelete]);
        await client.query('UPDATE ordini_fatturazione SET sub_id=NULL WHERE sub_id=ANY($1)', [idsToDelete]);
        if (bollIds.length) await client.query('DELETE FROM controllo_fatturazione WHERE origine_tipo=$1 AND origine_id=ANY($2)', ['bolletta', bollIds]);
        if (manIds.length)  await client.query('DELETE FROM controllo_fatturazione WHERE origine_tipo=$1 AND origine_id=ANY($2)', ['manutenzione', manIds]);
        await client.query('UPDATE controllo_fatturazione SET sub_id=NULL WHERE sub_id=ANY($1)', [idsToDelete]);
      }
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
      await client.query('UPDATE controllo_fatturazione SET attribuito_a_id=NULL WHERE attribuito_a_tipo=$1 AND attribuito_a_id=ANY($2)', ['cliente', intIds]);
    }
    if (ORIGINE_MAP[table]) {
      await client.query('DELETE FROM controllo_fatturazione WHERE origine_tipo=$1 AND origine_id=ANY($2)', [ORIGINE_MAP[table], idsToDelete]);
    }
    const result = idsToDelete.length
      ? await client.query(`DELETE FROM ${table} WHERE id=ANY($1) RETURNING id`, [idsToDelete])
      : { rows: [] };
    await client.query('COMMIT');
    res.json({
      deleted: result.rows.length, ids: result.rows.map(r => r.id),
      skipped: skippedConStorico.length,
      skippedIds: skippedConStorico,
      skippedReason: skippedConStorico.length ? 'Hanno bollette e/o pagamenti affitto collegati — elimina prima quelli dalla scheda del SUB se vuoi procedere comunque' : undefined,
    });
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
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: mediaType==='application/pdf'?'document':'image', source: { type:'base64', media_type:mediaType, data:b64 } },
          { type: 'text', text: 'Analizza questo documento (fattura, bolletta, contratto, APE, polizza, visura, verbale…) ed estrai in JSON puro senza markdown: {"tipo_documento":"uno tra: fattura|bolletta|contratto|ape|visura|planimetria|certificazione|polizza|verbale|preventivo|condominiale|altro","categoria_bolletta":"se è una bolletta, uno tra: luce|gas|acqua|internet|rifiuti|condominio|altro, altrimenti null","fornitore":"","num_fattura":"","data_fattura":"YYYY-MM-DD","periodo_dal":"YYYY-MM-DD se indicato un periodo di fornitura","periodo_al":"YYYY-MM-DD","scadenza":"YYYY-MM-DD (scadenza pagamento o validità, se presente)","importo":0,"descrizione":"breve descrizione utile come titolo","sub_codice":"se sul documento e scritto (anche A MANO, a penna o matita) un codice unita immobiliare tipo ORB-001, MON-2, COL-001, riportalo esattamente","indirizzo_fornitura":"via e citta di fornitura, se presenti"}. Se un dato manca usa null.' }
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
    if (parsed.error) {
      console.error('OCR - errore API Anthropic:', JSON.stringify(parsed.error));
      return res.status(400).json({ error: 'AI: ' + (parsed.error.message || parsed.error.type || 'richiesta rifiutata') });
    }
    const text = parsed.content?.[0]?.text || '{}';
    const clean = text.replace(/```json|```/g,'').trim();
    res.json({ dati: JSON.parse(clean) });
  } catch(e) { res.status(500).json({ error: 'Errore OCR: ' + e.message }); }
});

module.exports = router;
