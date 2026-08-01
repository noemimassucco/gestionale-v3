'use strict';
// ═══════ NOTIFICHE PERSONALI: helper per notificare un singolo utente ═══════
const pool = require('../config/db');

/**
 * Crea una notifica personale per un utente (appare nel popup "Per te").
 * Best-effort: non lancia mai, logga soltanto.
 */
async function notificaUtente(userId, { tipo, titolo, testo, link }) {
  if (!userId) return;
  try {
    await pool.query(
      'INSERT INTO notifiche_utente (user_id, tipo, titolo, testo, link) VALUES ($1,$2,$3,$4,$5)',
      [userId, tipo || 'info', titolo || '', testo || null, link || null]);
  } catch (e) { console.warn('[notify] notifica non salvata:', e.message); }
}

module.exports = { notificaUtente };
