'use strict';
// ═══════ MAILER CONDIVISO ═══════
// Usa le env: SMTP_HOST, SMTP_PORT (587), SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM

function smtpConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransport() {
  if (!smtpConfigured()) return null;
  let nodemailer;
  try { nodemailer = require('nodemailer'); } catch { return null; }
  const port = parseInt(process.env.SMTP_PORT || '587');
  // secure: se non specificato, deducilo dalla porta (465 = SSL, 587 = STARTTLS)
  const secure = process.env.SMTP_SECURE != null && process.env.SMTP_SECURE !== ''
    ? process.env.SMTP_SECURE === 'true'
    : port === 465;
  return nodemailer.createTransport({
    host: (process.env.SMTP_HOST || '').trim(),
    port, secure,
    auth: { user: (process.env.SMTP_USER || '').trim(), pass: (process.env.SMTP_PASS || '').replace(/\s+/g, '') },
    connectionTimeout: 12000, greetingTimeout: 12000, socketTimeout: 20000,
  });
}

function _spiegaErrore(e) {
  const msg = e.message || String(e);
  if (/Invalid login|Username and Password not accepted|535/i.test(msg))
    return 'Gmail ha rifiutato le credenziali. SMTP_PASS deve essere la "password per le app" di 16 lettere (myaccount.google.com/apppasswords), NON la password normale di Gmail.';
  if (/ETIMEDOUT|ECONNECTION|ECONNREFUSED|Greeting never received|ESOCKET/i.test(msg))
    return 'Connessione al server fallita. Controlla SMTP_HOST=smtp.gmail.com e prova SMTP_PORT=465 (oppure 587).';
  if (/ENOTFOUND|EDNS/i.test(msg))
    return 'Server non trovato: controlla che SMTP_HOST sia esattamente smtp.gmail.com (senza spazi).';
  return msg;
}

async function sendMail({ to, subject, html }) {
  const t = getTransport();
  if (!t) return { error: 'SMTP non configurato: imposta SMTP_HOST, SMTP_USER e SMTP_PASS su Render (per Gmail: smtp.gmail.com + password per le app)' };
  try {
    await t.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, html });
    return { ok: true };
  } catch (e) {
    console.error('[mailer]', e.message);
    return { error: 'Invio fallito: ' + _spiegaErrore(e) };
  }
}

module.exports = { sendMail, smtpConfigured };
