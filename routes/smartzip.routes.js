'use strict';
// ═══════ SMART ZIP: estrai, riconosci con AI, archivia ═══════
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const upload = require('../middleware/upload');
const { authMiddleware } = require('../middleware/auth');
const https = require('https');

const cloudinary = require('cloudinary').v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const MAX_FILES = 15;
const MAX_SIZE = 8 * 1024 * 1024;
const ESTENSIONI = { '.pdf':'application/pdf', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.webp':'image/webp', '.gif':'image/gif' };

function chiamaAI(buffer, mime) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Promise.reject(new Error('ANTHROPIC_API_KEY non configurata'));
  const payload = JSON.stringify({
    model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        { type: mime === 'application/pdf' ? 'document' : 'image', source: { type: 'base64', media_type: mime, data: buffer.toString('base64') } },
        { type: 'text', text: 'Analizza questo documento ed estrai in JSON puro senza markdown: {"tipo_documento":"uno tra: fattura|bolletta|contratto|ape|visura|planimetria|certificazione|polizza|verbale|preventivo|condominiale|altro","categoria_bolletta":"se bolletta: luce|gas|acqua|internet|rifiuti|condominio|altro, altrimenti null","fornitore":"","num_fattura":"","data_fattura":"YYYY-MM-DD","periodo_dal":"YYYY-MM-DD","periodo_al":"YYYY-MM-DD","scadenza":"YYYY-MM-DD","importo":0,"descrizione":"breve titolo","sub_codice":"se scritto (anche a mano) un codice tipo COL-001, riportalo","indirizzo_fornitura":"via e citta se presenti"}. Se un dato manca usa null.' }
      ]
    }]
  });
  return new Promise((resolve, reject) => {
    const r = https.request('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'x-api-key':apiKey, 'anthropic-version':'2023-06-01', 'Content-Length':Buffer.byteLength(payload) }
    }, resp => { let d=''; resp.on('data',c=>d+=c); resp.on('end',()=>resolve(d)); });
    r.on('error', reject); r.write(payload); r.end();
  }).then(raw => {
    const parsed = JSON.parse(raw);
    if (parsed.error) throw new Error('AI: ' + (parsed.error.message || parsed.error.type));
    const text = (parsed.content?.[0]?.text || '{}').replace(/```json|```/g,'').trim();
    return JSON.parse(text);
  });
}

async function trovaSub(d, subs) {
  if (d.sub_codice) {
    const c = String(d.sub_codice).toUpperCase().replace(/\s+/g,'');
    const m = subs.find(x => (x.codice||'').toUpperCase().replace(/\s+/g,'') === c);
    if (m) return { sub: m, via: 'codice sul documento' };
  }
  if (d.indirizzo_fornitura) {
    const ind = String(d.indirizzo_fornitura).toLowerCase();
    const m = subs.find(x => x.indirizzo_completo && ind.includes(String(x.indirizzo_completo).toLowerCase().split(',')[0].trim().slice(0,12)));
    if (m) return { sub: m, via: 'indirizzo' };
  }
  return null;
}

async function caricaFile(buffer, mime) {
  // Cloudinary → fallback DB (gestito dal chiamante per il DB)
  if (process.env.CLOUDINARY_CLOUD_NAME) {
    try {
      const b64 = `data:${mime};base64,${buffer.toString('base64')}`;
      const r = await cloudinary.uploader.upload(b64, { folder: 'gestionale-documenti', resource_type: 'auto' });
      return { url: r.secure_url, cloudinary_id: r.public_id };
    } catch(e) { console.error('smart-zip cloudinary:', e.message); }
  }
  return null;
}

router.post('/api/smart-zip', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nessun file' });
    let AdmZip;
    try { AdmZip = require('adm-zip'); } catch { return res.status(500).json({ error: 'Libreria zip non installata sul server' }); }

    let zip;
    try { zip = new AdmZip(req.file.buffer); } catch { return res.status(400).json({ error: 'File ZIP non valido' }); }

    const entries = zip.getEntries().filter(e => {
      if (e.isDirectory) return false;
      const nome = e.entryName.toLowerCase();
      if (nome.includes('__macosx') || nome.split('/').pop().startsWith('.')) return false;
      return Object.keys(ESTENSIONI).some(ext => nome.endsWith(ext));
    }).slice(0, MAX_FILES);

    if (!entries.length) return res.status(400).json({ error: 'Nessun PDF o immagine trovato nello ZIP' });

    const subs = (await pool.query('SELECT id,codice,indirizzo_completo FROM subs')).rows;
    const risultati = [];

    for (const e of entries) {
      const nomeFile = e.entryName.split('/').pop();
      try {
        const buffer = e.getData();
        if (buffer.length > MAX_SIZE) { risultati.push({ file: nomeFile, errore: 'File troppo grande (max 8 MB)' }); continue; }
        const ext = Object.keys(ESTENSIONI).find(x => nomeFile.toLowerCase().endsWith(x));
        const mime = ESTENSIONI[ext];

        const d = await chiamaAI(buffer, mime);
        const match = await trovaSub(d, subs);
        const subId = match ? match.sub.id : null;
        const isBolletta = d.tipo_documento === 'bolletta';
        const upl = await caricaFile(buffer, mime);

        if (isBolletta) {
          const r = await pool.query(
            `INSERT INTO bollette (sub_id,tipo,fornitore_nome,numero,importo,periodo_dal,periodo_al,scadenza,stato,url,cloudinary_id,note,created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'da_pagare',$9,$10,$11,$12) RETURNING id`,
            [subId, d.categoria_bolletta||'altro', d.fornitore||null, d.num_fattura||null,
             d.importo||null, d.periodo_dal||null, d.periodo_al||null, d.scadenza||null,
             upl?.url||null, upl?.cloudinary_id||null, 'Import automatico da ZIP: '+nomeFile, req.user.id]);
          if (!upl) {
            await pool.query('INSERT INTO bollette_files (bolletta_id,mime,size,data) VALUES ($1,$2,$3,$4)', [r.rows[0].id, mime, buffer.length, buffer]);
            await pool.query('UPDATE bollette SET url=$1 WHERE id=$2', ['/api/bollette/'+r.rows[0].id+'/file', r.rows[0].id]);
          }
          risultati.push({ file: nomeFile, tipo: 'bolletta ('+(d.categoria_bolletta||'altro')+')', sub: match?.sub.codice||null, via: match?.via||null, importo: d.importo||null, scadenza: d.scadenza||null, salvato: true });
        } else {
          const tipo = (d.tipo_documento && d.tipo_documento !== 'bolletta') ? d.tipo_documento : 'documento';
          const nome = d.descrizione || (tipo + (d.fornitore ? ' — '+d.fornitore : '') + ' ('+nomeFile+')');
          const r = await pool.query(
            `INSERT INTO documenti (sub_id,tipo,nome,url,cloudinary_id,data_documento,scadenza,importo,descrizione,created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
            [subId, tipo, nome, upl?.url||null, upl?.cloudinary_id||null,
             d.data_fattura||null, d.scadenza||null, d.importo||null,
             (d.fornitore?'Fornitore: '+d.fornitore:'')+' · Import ZIP: '+nomeFile, req.user.id]);
          if (!upl) {
            await pool.query('INSERT INTO documenti_files (documento_id,mime,size,data) VALUES ($1,$2,$3,$4)', [r.rows[0].id, mime, buffer.length, buffer]);
            await pool.query('UPDATE documenti SET url=$1 WHERE id=$2', ['/api/documenti/'+r.rows[0].id+'/file', r.rows[0].id]);
          }
          risultati.push({ file: nomeFile, tipo, sub: match?.sub.codice||null, via: match?.via||null, importo: d.importo||null, scadenza: d.scadenza||null, salvato: true });
        }
        if (subId) {
          await pool.query('INSERT INTO sub_storia (sub_id,tipo,titolo,descrizione,created_by) VALUES ($1,$2,$3,$4,$5)',
            [subId, 'documento', 'Import automatico: '+nomeFile, 'Riconosciuto come '+(d.tipo_documento||'documento')+' dallo ZIP', req.user.id]);
        }
      } catch(errFile) {
        risultati.push({ file: nomeFile, errore: errFile.message });
      }
    }
    const okN = risultati.filter(r => r.salvato).length;
    res.json({ totale: entries.length, salvati: okN, risultati });
  } catch(e) {
    console.error('POST /api/smart-zip:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
