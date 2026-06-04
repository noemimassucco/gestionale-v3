'use strict';
const cron = require('node-cron');
const pool = require('../config/db');

/**
 * Cron giornaliero 07:00 — scansiona promemoria in scadenza
 * nei prossimi 7 giorni e logga (+ email se SMTP configurato).
 */
function startPromemoriaEmailCron() {
  // Ogni giorno alle 07:00
  cron.schedule('0 7 * * *', async () => {
    const now = new Date().toISOString();
    console.log(`[cron] ${now} — scan promemoria in scadenza`);
    try {
      const r = await pool.query(`
        SELECT p.*,
               u.email    AS owner_email,
               u.nome     AS owner_nome,
               i.ragione_sociale AS entita_nome
        FROM promemoria p
        LEFT JOIN users     u ON p.user_id     = u.id
        LEFT JOIN inquilini i ON p.entita_tipo IN ('cliente','lead') AND p.entita_id = i.id
        WHERE p.completato = false
          AND p.data_evento BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
        ORDER BY p.data_evento, p.ora_evento
      `);

      if (!r.rows.length) {
        console.log('[cron] Nessun promemoria in scadenza nei prossimi 7 giorni.');
        return;
      }

      // Raggruppa per utente
      const byUser = {};
      r.rows.forEach(p => {
        const key = p.owner_email || 'no-email';
        if (!byUser[key]) byUser[key] = { nome: p.owner_nome, email: p.owner_email, items: [] };
        byUser[key].items.push(p);
      });

      // Log per ogni utente
      Object.values(byUser).forEach(u => {
        console.log(`[cron] ${u.email||'?'} — ${u.items.length} promemoria in scadenza:`);
        u.items.forEach(p => {
          const d = new Date(p.data_evento).toLocaleDateString('it-IT');
          console.log(`  · ${d} ${p.ora_evento||''} — ${p.titolo}`);
        });
      });

      // Email (se SMTP configurato tramite env SMTP_HOST + SMTP_USER + SMTP_PASS)
      if (process.env.SMTP_HOST && process.env.SMTP_USER) {
        await _sendEmails(byUser);
      }
    } catch(e) {
      console.error('[cron] Errore scan promemoria:', e.message);
    }
  }, { timezone: 'Europe/Rome' });

  console.log('[cron] Promemoria email cron registrato (ogni giorno 07:00 Europe/Rome)');
}

async function _sendEmails(byUser) {
  let nodemailer;
  try { nodemailer = require('nodemailer'); } catch { return; }

  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  for (const u of Object.values(byUser)) {
    if (!u.email) continue;
    const rows = u.items.map(p => {
      const d = new Date(p.data_evento).toLocaleDateString('it-IT');
      const ora = p.ora_evento ? ' ore ' + p.ora_evento.slice(0,5) : '';
      return `<tr><td>${d}${ora}</td><td><strong>${p.titolo}</strong></td><td>${p.entita_nome||''}</td></tr>`;
    }).join('');

    await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to:   u.email,
      subject: `[Gestionale] ${u.items.length} promemoria in scadenza`,
      html: `<p>Buongiorno ${u.nome||''},</p>
        <p>Hai <strong>${u.items.length}</strong> promemoria nei prossimi 7 giorni:</p>
        <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
          <tr><th>Data</th><th>Titolo</th><th>Entità</th></tr>${rows}
        </table>
        <p>Accedi al <a href="${process.env.APP_URL||'#'}">gestionale</a> per i dettagli.</p>`,
    }).catch(e => console.error('[cron] Email error:', e.message));
  }
}

module.exports = { startPromemoriaEmailCron };
