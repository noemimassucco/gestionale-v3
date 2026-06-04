'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

router.get('/api/dashboard', authMiddleware, async (req, res) => {
  try {
    const [totali, subsCritici, ultimi, spesePerMese] = await Promise.all([
      pool.query(`SELECT
        (SELECT COUNT(*) FROM subs) as num_subs,
        (SELECT COUNT(*) FROM interventi) as num_interventi,
        (SELECT COALESCE(SUM(prezzo),0) FROM interventi) as totale_spese,
        (SELECT COUNT(*) FROM manutenzioni WHERE stato='programmata') as manutenzioni_aperte,
        (SELECT COUNT(*) FROM documenti) as num_documenti`),
      pool.query(`SELECT s.id,s.codice,sd.nome as sede,i.ragione_sociale as inquilino,
        (SELECT COUNT(*) FROM interventi WHERE sub_id=s.id AND ha_notifica=true) as urgenze,
        (SELECT COALESCE(SUM(prezzo),0) FROM interventi WHERE sub_id=s.id) as totale_spese
        FROM subs s LEFT JOIN sedi sd ON s.sede_id=sd.id LEFT JOIN inquilini i ON s.inquilino_id=i.id
        WHERE (SELECT COUNT(*) FROM manutenzioni WHERE sub_id=s.id AND stato='programmata')>2
           OR (SELECT COUNT(*) FROM interventi WHERE sub_id=s.id AND ha_notifica=true)>0
        ORDER BY urgenze DESC LIMIT 6`),
      pool.query(`SELECT i.*,s.codice as sub_codice,sd.nome as sede,f.ragione_sociale as fornitore
        FROM interventi i LEFT JOIN subs s ON i.sub_id=s.id LEFT JOIN sedi sd ON s.sede_id=sd.id
        LEFT JOIN fornitori f ON i.fornitore_id=f.id
        ORDER BY COALESCE(i.data_intervento,i.created_at) DESC LIMIT 5`),
      pool.query(`SELECT EXTRACT(MONTH FROM COALESCE(data_intervento,created_at))::int as mese,
        COALESCE(SUM(prezzo),0) as totale
        FROM interventi
        WHERE COALESCE(data_intervento,created_at) >= NOW() - INTERVAL '6 months'
        GROUP BY mese ORDER BY mese`),
    ]);
    res.json({
      totali: totali.rows[0],
      subsCritici: subsCritici.rows,
      ultimi: ultimi.rows,
      spesePerMese: spesePerMese.rows,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/api/notifiche', authMiddleware, async (req, res) => {
  const [urgenti, scadenzeDoc, scadenzeMan, istat, incompleti] = await Promise.all([
    pool.query(`SELECT i.id, i.descrizione, s.codice as sub, sd.nome as sede, i.updated_at as data, 'urgente' as tipo
      FROM interventi i LEFT JOIN subs s ON i.sub_id=s.id LEFT JOIN sedi sd ON i.sede_id=sd.id
      WHERE i.ha_notifica=true ORDER BY i.updated_at DESC`),
    pool.query(`SELECT d.id, d.nome as titolo, s.codice as sub, sd.nome as sede, d.scadenza as data,
      'scadenza_doc' as tipo, (d.scadenza-CURRENT_DATE) as giorni
      FROM documenti d LEFT JOIN subs s ON d.sub_id=s.id LEFT JOIN sedi sd ON d.sede_id=sd.id
      WHERE d.scadenza IS NOT NULL AND d.scadenza >= CURRENT_DATE AND d.scadenza <= CURRENT_DATE + INTERVAL '90 days'
      ORDER BY d.scadenza`),
    pool.query(`SELECT m.id, m.tipo as titolo, s.codice as sub, sd.nome as sede, m.prossima_scadenza as data,
      'scadenza_man' as tipo, (m.prossima_scadenza-CURRENT_DATE) as giorni, m.priorita
      FROM manutenzioni m LEFT JOIN subs s ON m.sub_id=s.id LEFT JOIN sedi sd ON m.sede_id=sd.id
      WHERE m.prossima_scadenza IS NOT NULL AND m.prossima_scadenza >= CURRENT_DATE AND m.prossima_scadenza <= CURRENT_DATE + INTERVAL '90 days'
      AND m.stato != 'annullata' ORDER BY m.prossima_scadenza`),
    pool.query(`SELECT s.id, s.codice as titolo, sd.nome as sede, s.data_inizio_contratto as data, 'istat' as tipo,
      s.canone_annuo, s.tipo_contratto,
      ROUND((EXTRACT(EPOCH FROM AGE(NOW(),s.data_inizio_contratto))/2592000)::numeric) as mesi
      FROM subs s LEFT JOIN sedi sd ON s.sede_id=sd.id
      WHERE s.data_inizio_contratto IS NOT NULL AND s.canone_annuo IS NOT NULL
        AND AGE(NOW(),s.data_inizio_contratto) >= INTERVAL '12 months'`),
    pool.query(`SELECT s.id, s.codice as titolo, sd.nome as sede, s.created_at as data, 'incompleto' as tipo,
      CASE WHEN s.inquilino_id IS NULL THEN 'Manca inquilino' WHEN s.foglio IS NULL THEN 'Dati catastali incompleti' ELSE 'Canone non inserito' END as descrizione
      FROM subs s LEFT JOIN sedi sd ON s.sede_id=sd.id
      WHERE s.inquilino_id IS NULL OR s.foglio IS NULL OR s.canone_annuo IS NULL ORDER BY s.codice`),
  ]);
  const all = [
    ...urgenti.rows.map(r=>({...r,priorita:'alta'})),
    ...scadenzeDoc.rows.map(r=>({...r,priorita:parseInt(r.giorni)<14?'alta':parseInt(r.giorni)<30?'media':'bassa'})),
    ...scadenzeMan.rows.map(r=>({...r,priorita:r.priorita||'normale'})),
    ...istat.rows.map(r=>({...r,priorita:'media',descrizione:`Contratto da ${r.mesi} mesi — canone € ${parseFloat(r.canone_annuo).toLocaleString('it-IT')}/anno`})),
    ...incompleti.rows.map(r=>({...r,priorita:'bassa'})),
  ];
  res.json(all);
});

router.get('/api/calendario', authMiddleware, async (req, res) => {
  const {mese,anno}=req.query;
  const dal = mese&&anno ? `${anno}-${String(mese).padStart(2,'0')}-01` : null;
  const al  = mese&&anno ? new Date(parseInt(anno),parseInt(mese),0).toISOString().split('T')[0] : null;
  const w   = dal
    ? `AND scadenza BETWEEN '${dal}' AND '${al}'`
    : `AND scadenza >= CURRENT_DATE AND scadenza <= CURRENT_DATE + INTERVAL '90 days'`;
  const wP  = dal
    ? `AND data_evento BETWEEN '${dal}' AND '${al}'`
    : `AND data_evento >= CURRENT_DATE AND data_evento <= CURRENT_DATE + INTERVAL '90 days'`;

  try {
    const [docs,mans,bolls,istat,proms] = await Promise.all([
      pool.query(`SELECT 'documento' AS tipo,'📄' AS icon,d.nome AS titolo,d.scadenza,s.codice AS sub,sd.nome AS sede
        FROM documenti d LEFT JOIN subs s ON d.sub_id=s.id LEFT JOIN sedi sd ON d.sede_id=sd.id
        WHERE d.scadenza IS NOT NULL ${w} ORDER BY d.scadenza`),
      pool.query(`SELECT 'manutenzione' AS tipo,'🔨' AS icon,m.tipo AS titolo,m.prossima_scadenza AS scadenza,s.codice AS sub,sd.nome AS sede,m.priorita
        FROM manutenzioni m LEFT JOIN subs s ON m.sub_id=s.id LEFT JOIN sedi sd ON m.sede_id=sd.id
        WHERE m.prossima_scadenza IS NOT NULL AND m.stato!='annullata' ${w.replace(/scadenza/g,'prossima_scadenza')} ORDER BY m.prossima_scadenza`),
      pool.query(`SELECT 'bolletta' AS tipo,'⚡' AS icon,b.tipo||' '||COALESCE(b.fornitore_nome,'') AS titolo,b.scadenza,s.codice AS sub,sd.nome AS sede
        FROM bollette b LEFT JOIN subs s ON b.sub_id=s.id LEFT JOIN sedi sd ON s.sede_id=sd.id
        WHERE b.scadenza IS NOT NULL AND b.stato='da_pagare' ${w} ORDER BY b.scadenza`),
      pool.query(`SELECT 'contratto_istat' AS tipo,'📈' AS icon,'ISTAT: '||s.codice AS titolo,
        (s.data_inizio_contratto + INTERVAL '12 months')::DATE AS scadenza,s.codice AS sub,sd.nome AS sede
        FROM subs s LEFT JOIN sedi sd ON s.sede_id=sd.id
        WHERE s.data_inizio_contratto IS NOT NULL AND s.canone_annuo IS NOT NULL
          AND (s.data_inizio_contratto + INTERVAL '12 months') >= CURRENT_DATE`),
      pool.query(`SELECT 'promemoria' AS tipo,
          CASE p.tipo_azione WHEN 'chiamata' THEN '📞' WHEN 'email' THEN '✉️'
            WHEN 'visita' THEN '🏠' WHEN 'appuntamento' THEN '📋' ELSE '📅' END AS icon,
          p.titolo, p.data_evento AS scadenza, p.ora_evento,
          p.id, p.completato, p.tipo_azione, p.entita_tipo, p.entita_id
        FROM promemoria p
        WHERE p.user_id=$1 AND p.completato=false ${wP}
        ORDER BY p.data_evento, p.ora_evento NULLS LAST`, [req.user.id]),
    ]);
    const events = [...docs.rows,...mans.rows,...bolls.rows,...istat.rows,...proms.rows]
      .sort((a,b) => new Date(a.scadenza) - new Date(b.scadenza));
    res.json(events);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/api/news', authMiddleware, async (req, res) => {
  try {
    const https = require('https');
    const fetchUrl = (url) => new Promise((resolve, reject) => {
      https.get(url, {headers:{'User-Agent':'Mozilla/5.0'},timeout:3000}, (r) => {
        let data='';r.on('data',d=>data+=d);r.on('end',()=>resolve(data));
      }).on('error',reject).on('timeout',()=>reject(new Error('timeout')));
    });
    const xml = await fetchUrl('https://www.idealista.it/news/feed/');
    const items=[];
    const re=/<item[^>]*>([\s\S]*?)<\/item>/g;
    let m;
    while((m=re.exec(xml))!==null&&items.length<6){
      const b=m[1];
      const g=(t)=>{const r=new RegExp(`<${t}[^>]*>([\\s\\S]*?)<\\/${t}>`);const x=r.exec(b);return x?x[1].replace(/<!\[CDATA\[|\]\]>/g,'').trim():'';}
      const title=g('title'),link=g('link')||g('guid'),desc=g('description').replace(/<[^>]+>/g,'').slice(0,130),date=g('pubDate');
      if(title)items.push({title,link,desc,date});
    }
    if(items.length)return res.json(items);
  }catch(e){}
  res.json([
    {title:'Mercato immobiliare 2024: prezzi stabili nelle città medie',link:'https://www.idealista.it/news/',desc:'Il mercato immobiliare italiano mostra resilienza. I prezzi nelle città medie crescono del 2-3% rispetto all\'anno precedente.',date:new Date().toUTCString()},
    {title:'Aggiornamento indice ISTAT FOI: verificare per adeguamenti canoni',link:'https://www.istat.it/it/prezzi/prezzi-al-consumo/aggiornamento-valori-monetari',desc:"Pubblicato l'aggiornamento dell'indice FOI. Verificare il valore corrente per l'adeguamento dei contratti di locazione.",date:new Date().toUTCString()},
    {title:'Bonus ristrutturazione 2024: detrazioni al 50% e Superbonus',link:'https://www.agenziaentrate.gov.it/',desc:'Confermato il bonus ristrutturazione al 50% fino a 96.000€. Superbonus in progressiva riduzione al 70% per il 2024.',date:new Date().toUTCString()},
    {title:'Locazioni commerciali: guida al contratto e adeguamenti',link:'https://www.agenziaentrate.gov.it/',desc:'Per i contratti commerciali l\'adeguamento ISTAT è al 100% del FOI. Per abitativi la misura è il 75%. Attenzione alle scadenze.',date:new Date().toUTCString()},
    {title:'Catasto 2024: variazioni, DOCFA e nuove procedure',link:'https://sister.agenziaentrate.gov.it/',desc:'Aggiornate le procedure per la presentazione DOCFA. Scissioni e fusioni catastali: iter e tempistiche operative.',date:new Date().toUTCString()},
    {title:'Manutenzioni obbligatorie: scadenze caldaie, ascensori e antincendio',link:'#',desc:'Caldaie: verifica annuale. Ascensori: visita semestrale. Antincendio: revisione annuale. Sanzioni per inadempienze fino a €5.000.',date:new Date().toUTCString()},
  ]);
});

router.get('/api/riepilogo', authMiddleware, async (req, res) => {
  // All subs, even those with 0 interventions
  const subsR = await pool.query(`
    SELECT s.id, s.codice, s.ex_sub, s.stato_salute,
      sd.nome as sede, sd.id as sede_id,
      inq.ragione_sociale as inquilino
    FROM subs s
    LEFT JOIN sedi sd ON s.sede_id=sd.id
    LEFT JOIN inquilini inq ON s.inquilino_id=inq.id
    ORDER BY sd.nome, s.codice`);

  const intR = await pool.query(`
    SELECT i.sub_id, i.fornitore_id, COALESCE(i.prezzo,0) as prezzo,
      i.anno_fattura, f.ragione_sociale as fornitore
    FROM interventi i
    LEFT JOIN fornitori f ON i.fornitore_id=f.id`);

  const result = subsR.rows.map(sub => {
    const ints = intR.rows.filter(x => x.sub_id === sub.id);
    const totale = ints.reduce((s, x) => s + parseFloat(x.prezzo || 0), 0);
    const fornitori = {};
    ints.forEach(x => {
      if (x.fornitore) fornitori[x.fornitore] = (fornitori[x.fornitore] || 0) + parseFloat(x.prezzo || 0);
    });
    const anniSet = [...new Set(ints.map(x => x.anno_fattura).filter(Boolean))].sort();
    return {
      sub_id: sub.id,
      sub: sub.codice,
      ex_sub: sub.ex_sub,
      sede: sub.sede,
      sede_id: sub.sede_id,
      inquilino: sub.inquilino,
      stato_salute: sub.stato_salute,
      num_interventi: ints.length,
      totale,
      fornitori,
      anni: anniSet,
    };
  });
  res.json(result);
});

router.get('/api/riepilogo/fornitori', authMiddleware, async (req, res) => {
  const r = await pool.query(`
    SELECT f.id, f.ragione_sociale, f.spec,
      COUNT(i.id) as num_interventi,
      COALESCE(SUM(i.prezzo),0) as totale,
      MIN(i.data_intervento) as prima_data,
      MAX(i.data_intervento) as ultima_data,
      COUNT(DISTINCT i.sub_id) as num_subs
    FROM fornitori f
    LEFT JOIN interventi i ON i.fornitore_id=f.id
    GROUP BY f.id, f.ragione_sociale, f.spec
    ORDER BY totale DESC`);
  res.json(r.rows.map(x => ({...x, totale: parseFloat(x.totale), num_interventi: parseInt(x.num_interventi)})));
});

router.get('/api/riepilogo/anni', authMiddleware, async (req, res) => {
  const r = await pool.query(`
    SELECT
      COALESCE(anno_fattura::text, 'Anno non specificato') as anno,
      COUNT(*) as num_interventi,
      COALESCE(SUM(prezzo),0) as totale,
      COUNT(DISTINCT sub_id) as num_subs,
      COUNT(DISTINCT fornitore_id) as num_fornitori
    FROM interventi
    GROUP BY anno_fattura
    ORDER BY anno_fattura DESC NULLS LAST`);
  // Per anno: anche mesi
  const mesi = await pool.query(`
    SELECT
      COALESCE(anno_fattura::text,'?') as anno,
      EXTRACT(MONTH FROM data_fattura)::integer as mese,
      COUNT(*) as num,
      COALESCE(SUM(prezzo),0) as totale
    FROM interventi
    WHERE data_fattura IS NOT NULL
    GROUP BY anno_fattura, EXTRACT(MONTH FROM data_fattura)
    ORDER BY anno_fattura DESC, mese ASC`);
  res.json({ anni: r.rows.map(x=>({...x,totale:parseFloat(x.totale)})), mesi: mesi.rows.map(x=>({...x,totale:parseFloat(x.totale)})) });
});

router.get('/api/riepilogo/mesi', authMiddleware, async (req, res) => {
  const r = await pool.query(`
    SELECT
      TO_CHAR(data_fattura,'YYYY-MM') as mese_anno,
      TO_CHAR(data_fattura,'Month YYYY') as etichetta,
      COUNT(*) as num_interventi,
      COALESCE(SUM(prezzo),0) as totale
    FROM interventi
    WHERE data_fattura IS NOT NULL AND data_fattura >= NOW() - INTERVAL '24 months'
    GROUP BY TO_CHAR(data_fattura,'YYYY-MM'), TO_CHAR(data_fattura,'Month YYYY')
    ORDER BY mese_anno DESC`);
  res.json(r.rows.map(x=>({...x,totale:parseFloat(x.totale)})));
});

router.get('/api/riepilogo/sedi', authMiddleware, async (req, res) => {
  const r = await pool.query(`
    SELECT sd.nome as sede,
      COUNT(i.id) as num_interventi,
      COALESCE(SUM(i.prezzo),0) as totale,
      COUNT(DISTINCT i.sub_id) as num_subs,
      COUNT(DISTINCT i.fornitore_id) as num_fornitori
    FROM sedi sd
    LEFT JOIN interventi i ON i.sede_id=sd.id
    GROUP BY sd.nome ORDER BY totale DESC`);
  res.json(r.rows.map(x=>({...x,totale:parseFloat(x.totale)})));
});

router.get('/api/istat/calcola', authMiddleware, async (req, res) => {
  const { importo, mesi, percentuale } = req.query;
  if (!importo) return res.status(400).json({ error: 'Importo richiesto' });
  const imp = parseFloat(importo);
  const pct = parseFloat(percentuale) || 1.5; // % ISTAT default
  const m = parseInt(mesi) || 12;
  const aumento_annuo = imp * pct / 100;
  const nuovo_importo = imp + aumento_annuo;
  const aumento_mensile = aumento_annuo / 12;
  res.json({
    importo_originale: imp,
    percentuale_istat: pct,
    aumento_annuo: Math.round(aumento_annuo * 100) / 100,
    nuovo_importo_annuo: Math.round(nuovo_importo * 100) / 100,
    nuovo_importo_mensile: Math.round((nuovo_importo / 12) * 100) / 100,
    aumento_mensile: Math.round(aumento_mensile * 100) / 100,
    note: 'Indice ISTAT FOI. Per aggiornamento ufficiale verificare su istat.it'
  });
});

router.get('/api/search', authMiddleware, async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json({ interventi: [], subs: [], fornitori: [] });
  const like = `%${q}%`;
  const [interventi, subs, fornitori] = await Promise.all([
    pool.query(`SELECT i.id, i.descrizione, i.protocollo, i.data_intervento, i.prezzo,
      s.codice as sub, sd.nome as sede, f.ragione_sociale as fornitore
      FROM interventi i
      LEFT JOIN subs s ON i.sub_id=s.id LEFT JOIN sedi sd ON i.sede_id=sd.id LEFT JOIN fornitori f ON i.fornitore_id=f.id
      WHERE i.descrizione ILIKE $1 OR i.protocollo ILIKE $1 OR i.num_fattura ILIKE $1 OR s.codice ILIKE $1 OR f.ragione_sociale ILIKE $1
      ORDER BY i.updated_at DESC LIMIT 8`, [like]),
    pool.query(`SELECT s.id, s.codice, s.ex_sub, sd.nome as sede, i.ragione_sociale as inquilino
      FROM subs s LEFT JOIN sedi sd ON s.sede_id=sd.id LEFT JOIN inquilini i ON s.inquilino_id=i.id
      WHERE s.codice ILIKE $1 OR s.ex_sub ILIKE $1 OR i.ragione_sociale ILIKE $1 LIMIT 5`, [like]),
    pool.query('SELECT id, ragione_sociale, spec, tel FROM fornitori WHERE ragione_sociale ILIKE $1 LIMIT 5', [like])
  ]);
  res.json({ interventi: interventi.rows, subs: subs.rows, fornitori: fornitori.rows });
});

module.exports = router;
