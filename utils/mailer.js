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
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function sendMail({ to, subject, html }) {
  const t = getTransport();
  if (!t) return { error: 'SMTP non configurato: imposta SMTP_HOST, SMTP_USER e SMTP_PASS su Render (per Gmail: smtp.gmail.com + password per le app)' };
  try {
    await t.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, html });
    return { ok: true };
  } catch (e) {
    return { error: 'Invio fallito: ' + e.message };
  }
}

module.exports = { sendMail, smtpConfigured };
