'use strict';
// ═══════ BACKUP AUTOMATICO GIORNALIERO ═══════
// Ogni notte alle 03:00 esporta tutte le tabelle in JSON e:
//   1. carica la copia su Cloudinary (cartella 'gestionale-backups')
//   2. tiene le ultime 30 copie giornaliere + le copie del giorno 1 del mese (storiche)
//   3. la domenica invia una copia anche via EMAIL all'amministratore (se SMTP attivo)
const cron = require('node-cron');
const pool = require('../config/db');

const TABELLE = ['sedi','subs','inquilini','fornitori','categorie','interventi','manutenzioni',
  'documenti','bollette','ticket','contratti','pagamenti_affitto','storico_inquilini',
  'ordini_fatturazione','promemoria','sub_storia','team_messaggi','notifiche_utente','users'];

const GIORNI_DA_TENERE = 30;

function _cld() {
  const cloudinary = require('cloudinary').v2;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  return cloudinary;
}

async function _dump() {
  const dump = { exported: new Date().toISOString(), tables: {} };
  let totale = 0;
  for (const t of TABELLE) {
    try {
      // users: mai esportare le password
      const q = t === 'users'
        ? 'SELECT id,email,nome,ruolo,attivo,created_at FROM users'
        : `SELECT * FROM ${t}`;
      const r = await pool.query(q);
      dump.tables[t] = r.rows;
      totale += r.rows.length;
    } catch(e) { dump.tables[t] = { error: e.message }; }
  }
  dump.totalRows = totale;
  return { dump, totale };
}

// Cancella i backup giornalieri più vecchi di GIORNI_DA_TENERE
// (ma conserva per sempre quelli del giorno 1 del mese: archivio storico)
async function _ruotaBackup(cloudinary) {
  try {
    const res = await cloudinary.api.resources({
      type: 'upload', resource_type: 'raw', prefix: 'gestionale-backups/', max_results: 200,
    });
    const limite = new Date(); limite.setDate(limite.getDate() - GIORNI_DA_TENERE);
    for (const r of (res.resources || [])) {
      const m = (r.public_id || '').match(/backup-(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) continue;
      if (m[3] === '01') continue;                      // 1° del mese: si tiene per sempre
      const d = new Date(+m[1], +m[2] - 1, +m[3]);
      if (d < limite) {
        await cloudinary.uploader.destroy(r.public_id, { resource_type: 'raw' });
        console.log('[backup] 🧹 rimosso backup vecchio:', r.public_id);
      }
    }
  } catch(e) { console.warn('[backup] rotazione non riuscita:', e.message); }
}

async function eseguiBackup() {
  const { dump, totale } = await _dump();

  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    console.log('[backup] Cloudinary non configurato — backup solo in log:', totale, 'righe');
    return { ok: false, motivo: 'Cloudinary non configurato' };
  }
  const cloudinary = _cld();
  const json = JSON.stringify(dump);
  const b64 = 'data:application/json;base64,' + Buffer.from(json).toString('base64');
  const nome = 'backup-' + new Date().toISOString().slice(0,10);
  const result = await cloudinary.uploader.upload(b64, {
    folder: 'gestionale-backups', public_id: nome, resource_type: 'raw', overwrite: true,
  });
  console.log(`[backup] ✅ ${totale} righe salvate su Cloudinary: ${result.secure_url}`);

  await _ruotaBackup(cloudinary);
  return { ok: true, url: result.secure_url, righe: totale };
}

// Copia di sicurezza via email (allegato JSON) — indipendente da Cloudinary
async function backupViaEmail() {
  try {
    const { smtpConfigured, sendMail } = require('../utils/mailer');
    if (!smtpConfigured()) return { ok: false, motivo: 'SMTP non configurato' };
    const dest = process.env.BACKUP_EMAIL || process.env.SMTP_USER;
    if (!dest) return { ok: false, motivo: 'destinatario mancante' };
    const { dump, totale } = await _dump();
    const oggi = new Date().toISOString().slice(0,10);
    const r = await sendMail({
      to: dest,
      subject: `🗄️ Backup Gestionale Immobili — ${oggi} (${totale} righe)`,
      html: `<p>In allegato la copia completa dei dati del gestionale al ${oggi}.</p><p>Conserva queste email: sono la tua copia di riserva indipendente. Per ripristinare, basta questo file.</p>`,
      attachments: [{ filename: `gestionale-backup-${oggi}.json`, content: JSON.stringify(dump), contentType: 'application/json' }],
    });
    if (r.error) return { ok: false, motivo: r.error };
    console.log(`[backup] ✉️ copia inviata via email a ${dest} (${totale} righe)`);
    return { ok: true, righe: totale };
  } catch(e) { console.error('[backup] email fallita:', e.message); return { ok: false, motivo: e.message }; }
}

function startBackupCron() {
  // Ogni notte alle 03:00: backup su Cloudinary + rotazione
  cron.schedule('0 3 * * *', async () => {
    console.log('[backup] Avvio backup giornaliero…');
    try { await eseguiBackup(); }
    catch(e) { console.error('[backup] ❌ Errore:', e.message); }
    // La domenica anche la copia via email
    if (new Date().getDay() === 0) {
      try { await backupViaEmail(); } catch(e) { console.error('[backup] ❌ Email:', e.message); }
    }
  }, { timezone: 'Europe/Rome' });
  console.log('[backup] Cron backup registrato (ogni notte 03:00 Europe/Rome, email la domenica)');
}

module.exports = { startBackupCron, eseguiBackup, backupViaEmail };
