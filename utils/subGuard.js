'use strict';

// Blocco condiviso: un'operazione su un SUB non attivo (fuso/scisso/chiuso) non deve
// essere consentita. Prima questo identico controllo era copiato uguale in 5 file
// (affitti, bollette, fatturazione, interventi, manutenzioni) — stesso comportamento,
// solo centralizzato qui.
async function subNonAttivoErrore(pool, subId) {
  if (!subId) return null;
  const r = await pool.query('SELECT stato_sub FROM subs WHERE id=$1', [subId]);
  if (r.rows.length && r.rows[0].stato_sub && r.rows[0].stato_sub !== 'attivo') {
    return `SUB non attivo (stato: ${r.rows[0].stato_sub}) — operazione non consentita`;
  }
  return null;
}

// Variante per i punti (riaccatastamento/scissione) dove il SUB è già stato
// letto dal database per altri motivi: evita una query duplicata solo per
// il controllo. Stessa condizione, messaggio storicamente più corto (senza
// "operazione non consentita") perché usato in un contesto diverso.
function subNonAttivoErroreDaRiga(sub) {
  if (sub && sub.stato_sub && sub.stato_sub !== 'attivo') {
    return `SUB non attivo (stato: ${sub.stato_sub})`;
  }
  return null;
}

module.exports = { subNonAttivoErrore, subNonAttivoErroreDaRiga };
