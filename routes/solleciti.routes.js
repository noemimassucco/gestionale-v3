'use strict';
// ═══════ SOLLECITI DI PAGAMENTO E TEST EMAIL ═══════
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const { sendMail, smtpConfigured } = require('../utils/mailer');

const MESI = ['','Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

// Stato configurazione email (per la card in Impostazioni)
router.get('/api/email/status', authMiddleware, (req, res) => {
  res.json({ configurato: smtpConfigured() });
});

// Email di prova all'utente loggato
router.post('/api/email/test', authMiddleware, async (req, res) => {
  const r = await sendMail({
    to: req.user.email,
    subject: '[Gestionale] Email di prova',
    html: '<p>Se leggi questa email, la configurazione SMTP del gestionale funziona correttamente. ✅</p>',
  });
  if (r.error) return res.status(400).json(r);
  res.json({ ok: true });
});

// Sollecito di pagamento affitto all'inquilino
router.post('/api/solleciti/affitto/:pagamentoId', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT p.*, s.codice AS sub_codice, s.indirizzo_completo, s.id AS sub_id,
             i.ragione_sociale AS inquilino_nome, i.email AS inquilino_email
      FROM pagamenti_affitto p
      LEFT JOIN subs s ON p.sub_id = s.id
      LEFT JOIN inquilini i ON COALESCE(p.inquilino_id, s.inquilino_id) = i.id
      WHERE p.id = $1`, [req.params.pagamentoId]);
    if (!r.rows.length) return res.status(404).json({ error: 'Pagamento non trovato' });
    const p = r.rows[0];
    if (p.stato === 'pagato') return res.status(400).json({ error: 'Questo pagamento risulta già saldato' });
    if (!p.inquilino_email) return res.status(400).json({ error: 'L\'inquilino non ha un indirizzo email in anagrafica — aggiungilo da Clienti' });

    const periodo = `${MESI[p.mese] || p.mese} ${p.anno}`;
    const importo = parseFloat(p.importo || 0).toLocaleString('it-IT', { minimumFractionDigits: 2 });
    const esito = await sendMail({
      to: p.inquilino_email,
      subject: `Sollecito di pagamento — canone ${periodo}${p.sub_codice ? ' · ' + p.sub_codice : ''}`,
      html: `<p>Gentile ${p.inquilino_nome || 'inquilino'},</p>
        <p>le ricordiamo che risulta non ancora saldato il canone di locazione relativo a:</p>
        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
          <tr><td><strong>Periodo</strong></td><td>${periodo}</td></tr>
          ${p.sub_codice ? `<tr><td><strong>Unità</strong></td><td>${p.sub_codice}${p.indirizzo_completo ? ' — ' + p.indirizzo_completo : ''}</td></tr>` : ''}
          <tr><td><strong>Importo</strong></td><td>€ ${importo}</td></tr>
        </table>
        <p>La preghiamo di provvedere al pagamento quanto prima. Se il versamento è già stato effettuato, la invitiamo a ignorare questa comunicazione.</p>
        <p>Cordiali saluti</p>`,
    });
    if (esito.error) return res.status(400).json(esito);

    // Traccia il sollecito nello storico del SUB
    if (p.sub_id) {
      await pool.query(
        'INSERT INTO sub_storia (sub_id,tipo,titolo,descrizione,created_by) VALUES ($1,$2,$3,$4,$5)',
        [p.sub_id, 'nota', `Sollecito inviato — ${periodo}`,
         `Email di sollecito inviata a ${p.inquilino_nome} (${p.inquilino_email}) per € ${importo}`, req.user.id]);
    }
    res.json({ ok: true, email: p.inquilino_email });
  } catch (e) {
    console.error('POST /api/solleciti/affitto:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
