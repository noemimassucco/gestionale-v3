'use strict';
// ═══════ BACKUP AUTOMATICO SETTIMANALE ═══════
// Ogni domenica alle 03:00 esporta le tabelle principali in JSON e le carica
// su Cloudinary (cartella 'gestionale-backups'). Tiene al sicuro i DATI anche
// se il database avesse problemi. Richiede Cloudinary configurato.
const cron = require('node-cron');
const pool = require('../config/db');

const TABELLE = ['sedi','subs','inquilini','fornitori','categorie','interventi','manutenzioni',
  'documenti','bollette','ticket','contratti','pagamenti_affitto','storico_inquilini',
  'ordini_fatturazione','promemoria','sub_storia','users'];

async function eseguiBackup() {
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

  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    console.log('[backup] Cloudinary non configurato — backup solo in log:', totale, 'righe');
    return { ok: false, motivo: 'Cloudinary non configurato' };
  }
  const cloudinary = require('cloudinary').v2;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  const json = JSON.stringify(dump);
  const b64 = 'data:application/json;base64,' + Buffer.from(json).toString('base64');
  const nome = 'backup-' + new Date().toISOString().slice(0,10);
  const result = await cloudinary.uploader.upload(b64, {
    folder: 'gestionale-backups', public_id: nome, resource_type: 'raw', overwrite: true,
  });
  console.log(`[backup] ✅ ${totale} righe salvate su Cloudinary: ${result.secure_url}`);
  return { ok: true, url: result.secure_url, righe: totale };
}

function startBackupCron() {
  cron.schedule('0 3 * * 0', async () => {
    console.log('[backup] Avvio backup settimanale…');
    try { await eseguiBackup(); }
    catch(e) { console.error('[backup] ❌ Errore:', e.message); }
  }, { timezone: 'Europe/Rome' });
  console.log('[backup] Cron backup registrato (domenica 03:00 Europe/Rome)');
}

module.exports = { startBackupCron, eseguiBackup };
