'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

router.post('/api/chat', authMiddleware, async (req, res) => {
  const { messaggio } = req.body;
  if (!messaggio) return res.json({ risposta: 'Scrivi un messaggio!', dati: [] });
  const m = messaggio.toLowerCase();
  let risposta = '', dati = [], tipo = 'testo';

  try {
    // Pattern: interventi per tipo/categoria
    if (m.includes('idraul') || m.includes('perdita') || m.includes('acqua')) {
      const r = await pool.query(`SELECT i.id,i.descrizione,i.prezzo,i.data_intervento,s.codice as sub,f.ragione_sociale as fornitore FROM interventi i LEFT JOIN subs s ON i.sub_id=s.id LEFT JOIN fornitori f ON i.fornitore_id=f.id WHERE i.tags @> ARRAY['idraulico'] OR i.descrizione ILIKE '%idraul%' OR i.descrizione ILIKE '%perdita%' ORDER BY i.data_intervento DESC LIMIT 10`);
      dati = r.rows; tipo = 'interventi';
      risposta = `Ho trovato **${r.rows.length} interventi idraulici**. ${r.rows.length ? `Totale spese: € ${r.rows.reduce((s,x)=>s+(parseFloat(x.prezzo)||0),0).toLocaleString('it-IT')}.` : ''}`;
    }
    else if (m.includes('elettr')) {
      const r = await pool.query(`SELECT i.id,i.descrizione,i.prezzo,i.data_intervento,s.codice as sub,f.ragione_sociale as fornitore FROM interventi i LEFT JOIN subs s ON i.sub_id=s.id LEFT JOIN fornitori f ON i.fornitore_id=f.id WHERE i.tags @> ARRAY['elettrico'] OR i.descrizione ILIKE '%elettr%' ORDER BY i.data_intervento DESC LIMIT 10`);
      dati = r.rows; tipo = 'interventi';
      risposta = `Ho trovato **${r.rows.length} interventi elettrici**. Totale: € ${r.rows.reduce((s,x)=>s+(parseFloat(x.prezzo)||0),0).toLocaleString('it-IT')}.`;
    }
    else if (m.includes('urgent') || m.includes('emergenza') || m.includes('attenzione')) {
      const r = await pool.query(`SELECT i.id,i.descrizione,i.prezzo,i.data_intervento,s.codice as sub,sd.nome as sede,f.ragione_sociale as fornitore FROM interventi i LEFT JOIN subs s ON i.sub_id=s.id LEFT JOIN sedi sd ON i.sede_id=sd.id LEFT JOIN fornitori f ON i.fornitore_id=f.id WHERE i.ha_notifica=true ORDER BY i.updated_at DESC LIMIT 10`);
      dati = r.rows; tipo = 'interventi';
      risposta = r.rows.length ? `⚠️ **${r.rows.length} interventi richiedono attenzione!**` : '✅ Nessun intervento urgente al momento.';
    }
    else if ((m.includes('spese') || m.includes('costi') || m.includes('quanto')) && (m.includes('fornitore') || m.includes('ditta'))) {
      const r = await pool.query(`SELECT f.ragione_sociale,COUNT(i.id) as num,COALESCE(SUM(i.prezzo),0) as totale FROM fornitori f LEFT JOIN interventi i ON i.fornitore_id=f.id GROUP BY f.id,f.ragione_sociale ORDER BY totale DESC LIMIT 10`);
      dati = r.rows; tipo = 'fornitori';
      risposta = `Ecco la **classifica fornitori per spesa**:`;
    }
    else if (m.includes('immobili') && (m.includes('pi') || m.includes('spese') || m.includes('costi'))) {
      const r = await pool.query(`SELECT s.codice as sub,sd.nome as sede,COUNT(i.id) as num,COALESCE(SUM(i.prezzo),0) as totale FROM subs s LEFT JOIN sedi sd ON s.sede_id=sd.id LEFT JOIN interventi i ON i.sub_id=s.id GROUP BY s.id,s.codice,sd.nome ORDER BY totale DESC LIMIT 10`);
      dati = r.rows; tipo = 'subs';
      risposta = `Ecco i **SUB con le spese più alte**:`;
    }
    else if (m.includes('scadenz')) {
      const r = await pool.query(`SELECT d.*,s.codice as sub_codice,sd.nome as sede_nome,(d.scadenza-CURRENT_DATE) as giorni FROM documenti d LEFT JOIN subs s ON d.sub_id=s.id LEFT JOIN sedi sd ON d.sede_id=sd.id WHERE d.scadenza IS NOT NULL AND d.scadenza >= CURRENT_DATE ORDER BY d.scadenza ASC LIMIT 10`);
      dati = r.rows; tipo = 'documenti';
      risposta = r.rows.length ? `📅 **${r.rows.length} documenti in scadenza** nei prossimi mesi:` : '✅ Nessuna scadenza imminente.';
    }
    else if (m.includes('ultimo ann') || m.includes('quest ann') || (m.includes('interventi') && m.includes('ann'))) {
      const anno = new Date().getFullYear();
      const r = await pool.query(`SELECT i.id,i.descrizione,i.prezzo,i.data_intervento,s.codice as sub,f.ragione_sociale as fornitore FROM interventi i LEFT JOIN subs s ON i.sub_id=s.id LEFT JOIN fornitori f ON i.fornitore_id=f.id WHERE i.anno_fattura=$1 ORDER BY i.data_intervento DESC LIMIT 15`,[anno]);
      const tot = r.rows.reduce((s,x)=>s+(parseFloat(x.prezzo)||0),0);
      dati = r.rows; tipo = 'interventi';
      risposta = `**Interventi ${anno}:** ${r.rows.length} totali, spesa € ${tot.toLocaleString('it-IT')}.`;
    }
    else if (m.includes('riepilog') || m.includes('situazione') || m.includes('riassun')) {
      const r = await pool.query(`SELECT COUNT(*) as num_int, COALESCE(SUM(prezzo),0) as totale,(SELECT COUNT(*) FROM subs) as num_subs,(SELECT COUNT(*) FROM fornitori) as num_forn,(SELECT COUNT(*) FROM documenti) as num_docs FROM interventi`);
      const d = r.rows[0];
      risposta = `📊 **Situazione attuale:**\n• ${d.num_int} interventi totali\n• € ${parseFloat(d.totale).toLocaleString('it-IT')} spese totali\n• ${d.num_subs} SUB gestiti\n• ${d.num_forn} fornitori\n• ${d.num_docs} documenti archiviati`;
      tipo = 'riepilogo';
    }
    else if (m.includes('sub ') || m.includes('immobile ')) {
      // Cerca SUB specifico
      const subCode = (m.match(/sub\s+([a-z0-9\-]+)/i) || m.match(/immobile\s+([a-z0-9\-]+)/i))?.[1]?.toUpperCase();
      if (subCode) {
        const sub = await pool.query(`SELECT s.*,sd.nome as sede,i.ragione_sociale as inquilino FROM subs s LEFT JOIN sedi sd ON s.sede_id=sd.id LEFT JOIN inquilini i ON s.inquilino_id=i.id WHERE UPPER(s.codice) LIKE $1 LIMIT 1`, [`%${subCode}%`]);
        if (sub.rows.length) {
          const s = sub.rows[0];
          const ints = await pool.query(`SELECT COUNT(*) as n, COALESCE(SUM(prezzo),0) as tot FROM interventi WHERE sub_id=$1`, [s.id]);
          risposta = `🏠 **SUB ${s.codice}** (${s.sede})\nInquilino: ${s.inquilino||'—'}\n${ints.rows[0].n} interventi · € ${parseFloat(ints.rows[0].tot).toLocaleString('it-IT')} totale\nSalute: ${s.stato_salute==='rosso'?'🔴 Critico':s.stato_salute==='giallo'?'🟡 Attenzione':'🟢 OK'}`;
          tipo = 'sub_detail';
        } else {
          risposta = `Non ho trovato nessun SUB con codice "${subCode}".`;
        }
      }
    }
    else if (m.includes('fornitore') || m.includes('ditta')) {
      const nome = m.replace(/fornitore|ditta|mostrami|trovami|cercami|informazioni su/gi,'').trim();
      if (nome.length > 2) {
        const r = await pool.query(`SELECT f.*,COUNT(i.id) as num_int,COALESCE(SUM(i.prezzo),0) as totale FROM fornitori f LEFT JOIN interventi i ON i.fornitore_id=f.id WHERE LOWER(f.ragione_sociale) LIKE $1 GROUP BY f.id ORDER BY totale DESC LIMIT 5`, [`%${nome}%`]);
        dati = r.rows; tipo = 'fornitori';
        risposta = r.rows.length ? `Ho trovato **${r.rows.length} fornitore/i** corrispondenti:` : `Nessun fornitore trovato per "${nome}".`;
      }
    }
    else if (m.includes('document') || m.includes('fattur') || m.includes('contratt')) {
      const r = await pool.query(`SELECT d.*,s.codice as sub_codice,sd.nome as sede_nome FROM documenti d LEFT JOIN subs s ON d.sub_id=s.id LEFT JOIN sedi sd ON d.sede_id=sd.id ORDER BY d.created_at DESC LIMIT 10`);
      dati = r.rows; tipo = 'documenti';
      risposta = `Ho trovato **${r.rows.length} documenti** recenti:`;
    }
    else {
      // Ricerca libera
      const r = await pool.query(`SELECT i.id,i.descrizione,i.prezzo,i.data_intervento,s.codice as sub,sd.nome as sede,f.ragione_sociale as fornitore FROM interventi i LEFT JOIN subs s ON i.sub_id=s.id LEFT JOIN sedi sd ON i.sede_id=sd.id LEFT JOIN fornitori f ON i.fornitore_id=f.id WHERE i.descrizione ILIKE $1 OR f.ragione_sociale ILIKE $1 OR s.codice ILIKE $1 ORDER BY i.data_intervento DESC LIMIT 8`, [`%${messaggio}%`]);
      if (r.rows.length) {
        dati = r.rows; tipo = 'interventi';
        risposta = `Ho trovato **${r.rows.length} risultati** per "${messaggio}":`;
      } else {
        risposta = `Non ho trovato risultati per "${messaggio}". Prova a chiedere:\n• "Mostrami interventi idraulici"\n• "Spese per fornitore"\n• "Interventi urgenti"\n• "Situazione SUB OB-01"\n• "Scadenze documenti"`;
      }
    }
  } catch(e) {
    risposta = 'Errore nella ricerca: ' + e.message;
  }

  res.json({ risposta, dati, tipo });
});

module.exports = router;
