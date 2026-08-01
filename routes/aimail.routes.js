'use strict';
// ═══════ AI: SCRITTURA EMAIL DA BOZZA ═══════
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { sendMail } = require('../utils/mailer');
const https = require('https');

router.post('/api/ai/email', authMiddleware, async (req, res) => {
  const { bozza, tono, destinatario, contesto } = req.body;
  if (!bozza || !String(bozza).trim()) return res.status(400).json({ error: 'Scrivi almeno una bozza' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'ANTHROPIC_API_KEY non configurata su Render' });

  const prompt = `Sei l'assistente di un'azienda italiana di gestione immobiliare. Trasforma questa bozza in una email professionale completa in italiano.

Bozza: ${bozza}
${destinatario ? 'Destinatario: ' + destinatario : ''}
${contesto ? 'Contesto: ' + contesto : ''}
Tono richiesto: ${tono || 'professionale e cortese'}

Regole: email completa con saluto e chiusura; non inventare dati non presenti nella bozza (usa [DA COMPLETARE] se manca qualcosa di essenziale); firma con "Immobiliare Massucco". Rispondi in JSON puro senza markdown: {"oggetto":"...","testo":"corpo email con a-capo \\n"}`;

  const payload = JSON.stringify({
    model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });
  try {
    const raw = await new Promise((resolve, reject) => {
      const r = https.request('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(payload) }
      }, resp => { let d = ''; resp.on('data', c => d += c); resp.on('end', () => resolve(d)); });
      r.on('error', reject); r.write(payload); r.end();
    });
    const parsed = JSON.parse(raw);
    if (parsed.error) return res.status(400).json({ error: 'AI: ' + (parsed.error.message || parsed.error.type) });
    const text = (parsed.content?.[0]?.text || '{}').replace(/```json|```/g, '').trim();
    res.json(JSON.parse(text));
  } catch (e) { res.status(500).json({ error: 'Errore AI: ' + e.message }); }
});

// Invio dell'email generata (usa l'SMTP configurato)
router.post('/api/ai/email/invia', authMiddleware, async (req, res) => {
  const { to, oggetto, testo } = req.body;
  if (!to || !oggetto || !testo) return res.status(400).json({ error: 'Destinatario, oggetto e testo obbligatori' });
  const r = await sendMail({
    to,
    subject: oggetto,
    html: String(testo).split('\n').map(r2 => r2.trim() ? '<p style="margin:0 0 10px;">' + r2 + '</p>' : '').join(''),
  });
  if (r.error) return res.status(400).json(r);
  res.json({ ok: true });
});

module.exports = router;
