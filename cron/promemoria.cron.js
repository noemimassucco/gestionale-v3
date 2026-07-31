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
      // Recupera promemoria non completati nei prossimi 7 giorni
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
        console.log('[cron] Nessun promemoria nei prossimi 7 giorni.');
        return;
      }

      const oggi = new Date(); oggi.setHours(0,0,0,0);

      // Filtra solo i promemoria il cui alert deve scattare OGGI
      const daNotificare = r.rows.filter(p => {
        const dataEvento = new Date(p.data_evento); dataEvento.setHours(0,0,0,0);
        const diffGiorni = Math.round((dataEvento - oggi) / 86400000);
        const alertGiorni = Array.isArray(p.alert_giorni_prima) ? p.alert_giorni_prima : [];
        // Notifica se: oggi è il giorno dell'evento, o se diffGiorni è in alert_giorni_prima
        return diffGiorni === 0 || alertGiorni.includes(diffGiorni);
      });

      if (!daNotificare.length) {
        console.log('[cron] Nessun alert da inviare oggi.');
        return;
      }

      // Raggruppa per utente (solo quelli da notificare oggi)
      const byUser = {};
      daNotificare.forEach(p => {
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

      // ── Scadenze documenti e manutenzioni nei prossimi 7 giorni → email allo staff ──
      try {
        const sc = await pool.query(`
          SELECT 'Documento' AS tipo, d.nome AS titolo, d.scadenza, s.codice AS sub_codice
            FROM documenti d LEFT JOIN subs s ON d.sub_id=s.id
           WHERE d.scadenza BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
          UNION ALL
          SELECT 'Manutenzione', m.tipo, m.prossima_scadenza, s.codice
            FROM manutenzioni m LEFT JOIN subs s ON m.sub_id=s.id
           WHERE m.prossima_scadenza BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
             AND m.stato NOT IN ('annullata','completata')
          ORDER BY 3`);
        if (sc.rows.length && process.env.SMTP_HOST && process.env.SMTP_USER) {
          const staff = await pool.query(`SELECT email,nome FROM users WHERE attivo=true AND ruolo IN ('admin','operatore') AND email IS NOT NULL`);
          await _sendScadenzeEmail(sc.rows, staff.rows);
        }
      } catch(e) { console.error('[cron] Errore scan scadenze:', e.message); }
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

async function _sendScadenzeEmail(scadenze, utenti) {
  let nodemailer;
  try { nodemailer = require('nodemailer'); } catch { return; }
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  const rows = scadenze.map(r => {
    const d = new Date(r.scadenza).toLocaleDateString('it-IT');
    return `<tr><td>${d}</td><td>${r.tipo}</td><td><strong>${r.titolo||''}</strong></td><td>${r.sub_codice||''}</td></tr>`;
  }).join('');
  for (const u of utenti) {
    await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: u.email,
      subject: `[Gestionale] ${scadenze.length} scadenze nei prossimi 7 giorni`,
      html: `<p>Buongiorno ${u.nome||''},</p>
        <p>Queste scadenze arrivano entro 7 giorni:</p>
        <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
          <tr><th>Scadenza</th><th>Tipo</th><th>Cosa</th><th>SUB</th></tr>${rows}
        </table>
        <p>Accedi al <a href="${process.env.APP_URL||'#'}">gestionale</a> per i dettagli.</p>`,
    }).catch(e => console.error('[cron] Email scadenze error:', e.message));
  }
}

module.exports = { startPromemoriaEmailCron };
