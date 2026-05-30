'use strict';
const pool = require('../config/db');

function generateTags(descrizione, note) {
  const text = ((descrizione || '') + ' ' + (note || '')).toLowerCase();
  const rules = [
    { tags: ['elettrico', 'impianto elettrico'], keywords: ['elettr', 'quadro', 'presa', 'cavo', 'impianto elettr', 'salvavita', 'differenziale', 'interruttore'] },
    { tags: ['idraulico'], keywords: ['idraul', 'perdita', 'scarico', 'tubo', 'acqua', 'rubinett', 'sifone', 'fognatura'] },
    { tags: ['climatizzazione', 'cdz'], keywords: ['cdz', 'climat', 'condizion', 'split', 'fancoil', 'caldaia', 'riscaldamento', 'termoidraul'] },
    { tags: ['urgente'], keywords: ['urgent', 'emergenza', 'immediato', 'subito', 'pronto intervento'] },
    { tags: ['attenzione'], keywords: ['attenzione', 'da verificare', 'controllare', 'verificare', 'problema'] },
    { tags: ['sicurezza'], keywords: ['antincendio', 'estintore', 'sicurezza', 'allarme', 'sorveglianza', 'telecamera'] },
    { tags: ['edile'], keywords: ['murar', 'intonac', 'tintegg', 'vernic', 'paviment', 'piastrelle', 'cartongesso', 'soffitto'] },
    { tags: ['infiltrazione'], keywords: ['infiltraz', 'umidità', 'muffa', 'perdita', 'infiltr', 'acqua dal'] },
    { tags: ['manutenzione'], keywords: ['manutenzione', 'manutenzioni', 'programmata', 'periodica', 'revisione', 'controllo'] },
    { tags: ['ascensore'], keywords: ['ascensore', 'montacarichi', 'elevatore'] },
  ];
  const tags = new Set();
  rules.forEach(rule => {
    if (rule.keywords.some(k => text.includes(k))) {
      rule.tags.forEach(t => tags.add(t));
    }
  });
  // Notifica se parole critiche
  const criticalWords = ['urgente', 'attenzione', 'da verificare', 'controllare', 'problema', 'emergenza'];
  const hasNotifica = criticalWords.some(w => text.includes(w));
  return { tags: Array.from(tags), hasNotifica };
}

function extractPriceFromText(text) {
  if (!text) return null;
  const t = String(text);
  const found = [];

  // Pattern €1.500,00 o € 1500,00
  const p1 = /€\s*([\d]{1,3}(?:[.,]\d{3})*(?:[,\.]\d{1,2})?)/g;
  // Pattern 1.500,00€ o 1500 €
  const p2 = /([\d]{1,3}(?:[.,]\d{3})*(?:[,\.]\d{1,2})?)\s*€/g;
  // Pattern totale/importo/imponibile/costo: 1500
  const p3 = /(?:totale|importo|imponibile|costo|prezzo)[:\s]+(?:di\s+)?€?\s*([\d]{1,3}(?:[.,]\d{3})*(?:[,\.]\d{1,2})?)/gi;
  // Pattern euro 1500
  const p4 = /(?:euro|eur)\s+([\d]{1,3}(?:[.,]\d{3})*(?:[,\.]\d{1,2})?)/gi;

  const parseItalian = raw => {
    if (!raw) return NaN;
    // Es: 1.500,00 → 1500.00 | 1500,00 → 1500.00 | 1.500 → 1500
    if (raw.includes(',') && raw.includes('.')) {
      const li = raw.lastIndexOf(','), ld = raw.lastIndexOf('.');
      return li > ld
        ? parseFloat(raw.replace(/\./g,'').replace(',','.'))
        : parseFloat(raw.replace(/,/g,''));
    }
    if (raw.includes(',')) {
      const parts = raw.split(',');
      return parts[parts.length-1].length <= 2
        ? parseFloat(raw.replace(',','.'))
        : parseFloat(raw.replace(/,/g,''));
    }
    if (raw.includes('.')) {
      const parts = raw.split('.');
      return parts[parts.length-1].length <= 2 && parts.length === 2
        ? parseFloat(raw)
        : parseFloat(raw.replace(/\./g,''));
    }
    return parseFloat(raw);
  };

  for (const pat of [p1,p2,p3,p4]) {
    let m;
    const re = new RegExp(pat.source, pat.flags);
    while ((m = re.exec(t)) !== null) {
      const n = parseItalian(m[1]);
      if (!isNaN(n) && n > 0 && n < 10000000) found.push(n);
    }
  }
  if (!found.length) return null;
  return Math.max(...found); // Restituisce il valore più alto (di solito il totale)
}

async function updateSaluteImmobile(subId) {
  const r = await pool.query(`
    SELECT COUNT(*) as cnt,
      SUM(CASE WHEN ha_notifica THEN 1 ELSE 0 END) as urgenti,
      SUM(CASE WHEN data_intervento >= NOW() - INTERVAL '12 months' THEN 1 ELSE 0 END) as ultimi12
    FROM interventi WHERE sub_id=$1`, [subId]);
  const { cnt, urgenti, ultimi12 } = r.rows[0];
  let salute = 'verde';
  if (parseInt(urgenti) > 0 || parseInt(ultimi12) >= 5) salute = 'rosso';
  else if (parseInt(ultimi12) >= 3) salute = 'giallo';
  await pool.query('UPDATE subs SET stato_salute=$1 WHERE id=$2', [salute, subId]);
}


function parseDate(d) {
  if (!d) return null;
  const str = String(d).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(str)) { const [dd,mm,yy]=str.split(/[\/\-]/); return `${yy}-${mm}-${dd}`; }
  if (/^\d{2}[\/\-]\d{2}[\/\-]\d{2}$/.test(str)) { const [dd,mm,yy]=str.split(/[\/\-]/); return `20${yy}-${mm}-${dd}`; }
  if (/^\d{5}$/.test(str)) { const dt=new Date(Math.round((parseInt(str)-25569)*86400*1000)); return dt.toISOString().split('T')[0]; }
  return null;
}

function parsePrice(v) {
  if (!v) return null;
  const str = String(v).replace(/[€$£\s]/g,'').replace(',','.');
  const n = parseFloat(str);
  return isNaN(n) ? null : n;
}

function normalizeStr(s) {
  return (s||'').toLowerCase().trim().replace(/\s+/g,' ');
}


module.exports = { generateTags, extractPriceFromText, updateSaluteImmobile, parseDate, parsePrice, normalizeStr };
