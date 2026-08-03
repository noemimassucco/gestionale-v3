'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const { subNonAttivoErrore } = require('../utils/subGuard');

router.get('/api/fatturazione', authMiddleware, async (req, res) => {
  const { anno, mese, stato_pagamento, contabilizzato, fatturato, sub_id, inquilino_id } = req.query;
  let where = ['1=1'], params = [], p = 1;
  if (anno) { where.push(`o.anno_riferimento=$${p++}`); params.push(parseInt(anno)); }
  if (mese) { where.push(`o.mese_riferimento=$${p++}`); params.push(parseInt(mese)); }
  if (stato_pagamento) { where.push(`o.stato_pagamento=$${p++}`); params.push(stato_pagamento); }
  if (contabilizzato !== undefined && contabilizzato !== '') { where.push(`o.flag_contabilizzato=$${p++}`); params.push(contabilizzato === 'true'); }
  // "Fatturato" = numero_fattura valorizzato — di solito arriva dal reimport della contabile
  if (fatturato !== undefined && fatturato !== '') { where.push(fatturato === 'true' ? `o.numero_fattura IS NOT NULL` : `o.numero_fattura IS NULL`); }
  if (sub_id) { where.push(`o.sub_id=$${p++}`); params.push(sub_id); }
  if (inquilino_id) { where.push(`o.inquilino_id=$${p++}`); params.push(inquilino_id); }
  try {
    const r = await pool.query(`
      SELECT o.*,s.codice as sub_codice,sd.nome as sede_nome,i.ragione_sociale as cliente_nome,i.email as cliente_email
      FROM ordini_fatturazione o
      LEFT JOIN subs s ON o.sub_id=s.id LEFT JOIN sedi sd ON s.sede_id=sd.id
      LEFT JOIN inquilini i ON o.inquilino_id=i.id
      WHERE ${where.join(' AND ')} ORDER BY o.anno_riferimento DESC NULLS LAST,o.mese_riferimento DESC NULLS LAST,o.created_at DESC`,params);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/api/fatturazione', authMiddleware, async (req, res) => {
  const f = req.body;
  const { sub_id } = f;
  const subErr = await subNonAttivoErrore(pool, sub_id);
  if (subErr) return res.status(400).json({ error: subErr });
  try {
    const r = await pool.query(
      `INSERT INTO ordini_fatturazione
        (sub_id,inquilino_id,tipo_servizio,nome_servizio,descrizione,importo,periodicita,
         data_inizio,data_fine,stato,mese_riferimento,anno_riferimento,
         numero_fattura,data_fatturazione,stato_pagamento,flag_contabilizzato,note,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [f.sub_id||null,f.inquilino_id||null,f.tipo_servizio||'servizio_vario',
       f.nome_servizio||null,f.descrizione||null,f.importo||null,f.periodicita||'mensile',
       f.data_inizio||null,f.data_fine||null,f.stato||'attivo',
       f.mese_riferimento||null,f.anno_riferimento||null,
       f.numero_fattura||null,f.data_fatturazione||null,
       f.stato_pagamento||'non_pagato',f.flag_contabilizzato||false,f.note||null,req.user.id]);
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/api/fatturazione/:id', authMiddleware, async (req, res) => {
  const f = req.body;
  try {
    const r = await pool.query(
      `UPDATE ordini_fatturazione SET
        sub_id=$1,inquilino_id=$2,tipo_servizio=$3,nome_servizio=$4,descrizione=$5,
        importo=$6,periodicita=$7,data_inizio=$8,data_fine=$9,stato=$10,
        mese_riferimento=$11,anno_riferimento=$12,numero_fattura=$13,data_fatturazione=$14,
        data_pagamento=COALESCE($15::date,data_pagamento),stato_pagamento=COALESCE($16,stato_pagamento),
        flag_contabilizzato=COALESCE($17::boolean,flag_contabilizzato),
        importo_pagato=COALESCE($18::numeric,importo_pagato),note_contabili=COALESCE($19,note_contabili),
        note=$20,updated_at=NOW()
       WHERE id=$21 RETURNING *`,
      [f.sub_id||null,f.inquilino_id||null,f.tipo_servizio||'servizio_vario',
       f.nome_servizio||null,f.descrizione||null,f.importo||null,f.periodicita||'mensile',
       f.data_inizio||null,f.data_fine||null,f.stato||'attivo',
       f.mese_riferimento||null,f.anno_riferimento||null,
       f.numero_fattura||null,f.data_fatturazione||null,
       f.data_pagamento||null,f.stato_pagamento||null,
       (f.flag_contabilizzato===true||f.flag_contabilizzato===false)?f.flag_contabilizzato:null,f.importo_pagato||null,
       f.note_contabili||null,f.note||null,req.params.id]);
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/api/fatturazione/:id', authMiddleware, async (req, res) => {
  await pool.query('DELETE FROM ordini_fatturazione WHERE id=$1',[req.params.id]);
  res.json({ok:true});
});

router.post('/api/fatturazione/:id/paga', authMiddleware, async (req, res) => {
  const {data_pagamento,importo_pagato}=req.body;
  const r=await pool.query(
    `UPDATE ordini_fatturazione SET stato_pagamento='pagato',data_pagamento=$1,importo_pagato=COALESCE($2::numeric,importo),updated_at=NOW() WHERE id=$3 RETURNING *`,
    [data_pagamento||new Date().toISOString().split('T')[0],importo_pagato||null,req.params.id]);
  res.json(r.rows[0]);
});

router.post('/api/fatturazione/:id/contabilizza', authMiddleware, async (req, res) => {
  const r=await pool.query(`UPDATE ordini_fatturazione SET flag_contabilizzato=NOT flag_contabilizzato,updated_at=NOW() WHERE id=$1 RETURNING *`,[req.params.id]);
  res.json(r.rows[0]);
});

router.get('/api/fatturazione/export', authMiddleware, async (req, res) => {
  const {anno,mese,da,a}=req.query;
  let where=['1=1'],params=[],p=1;
  if(anno){where.push(`o.anno_riferimento=$${p++}`);params.push(anno);}
  if(mese){where.push(`o.mese_riferimento=$${p++}`);params.push(mese);}
  if(da){where.push(`o.data_fatturazione>=$${p++}`);params.push(da);}
  if(a){where.push(`o.data_fatturazione<=$${p++}`);params.push(a);}
  const r=await pool.query(`
    SELECT o.id,i.ragione_sociale as cliente,o.nome_servizio as servizio,o.tipo_servizio,
      s.codice as sub,o.importo,o.periodicita,o.data_fatturazione,o.numero_fattura,
      o.stato_pagamento,o.data_pagamento,o.importo_pagato,o.stato,
      CASE WHEN o.flag_contabilizzato THEN 'SI' ELSE 'NO' END as contabilizzato,
      o.note_contabili as note,o.mese_riferimento as mese,o.anno_riferimento as anno
    FROM ordini_fatturazione o
    LEFT JOIN subs s ON o.sub_id=s.id LEFT JOIN inquilini i ON o.inquilino_id=i.id
    WHERE ${where.join(' AND ')} ORDER BY o.anno_riferimento DESC,o.mese_riferimento DESC`,params);
  res.json(r.rows);
});

// Segna come "esportato" le rate canone incluse in un export verso la contabilità.
// Solo per le rate ancora "da_fatturare" — non retrocede mai una riga già fatturata.
router.post('/api/fatturazione/segna-esportato', authMiddleware, async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.json({ aggiornate: 0 });
  const r = await pool.query(
    `UPDATE ordini_fatturazione SET stato='esportato', updated_at=NOW()
     WHERE id=ANY($1) AND tipo_servizio='canone_locazione' AND stato='da_fatturare'`,
    [ids]);
  res.json({ aggiornate: r.rowCount });
});

// Le intestazioni Excel sono in italiano (vedi headers in fattExport, public/js/fatturazione.js);
// XLSX.sheet_to_json restituisce le chiavi con il testo esatto della colonna, non i nomi dei
// campi del DB — senza questa mappa il reimport non trovava MAI corrispondenza su nessun campo
// (compreso il numero fattura, che restava sempre vuoto anche dopo un reimport "riuscito").
const REIMPORT_HEADER_MAP = {
  'ID': 'id',
  'N° Fattura': 'numero_fattura',
  'Data Fatturazione': 'data_fatturazione',
  'Stato Pagamento': 'stato_pagamento',
  'Data Pagamento': 'data_pagamento',
  'Contabilizzato': 'flag_contabilizzato',
  'Note': 'note_contabili',
};

router.post('/api/fatturazione/reimport', authMiddleware, async (req, res) => {
  const {rows}=req.body;
  if(!rows?.length)return res.json({updated:0,notFound:0,errors:[]});
  let updated=0,notFound=0,errors=[];
  for(const rawRow of rows){
    const row={};
    for(const [k,v] of Object.entries(rawRow)){
      const mapped=REIMPORT_HEADER_MAP[String(k).trim()];
      if(mapped && v!=='' && v!==undefined && v!==null) row[mapped]=v;
    }
    try{
      const key=row.id||row.numero_fattura; if(!key)continue;
      const field=row.id?'id':'numero_fattura';
      const updates={};
      if(row.numero_fattura)updates.numero_fattura=String(row.numero_fattura);
      if(row.data_fatturazione)updates.data_fatturazione=row.data_fatturazione;
      if(row.stato_pagamento)updates.stato_pagamento=row.stato_pagamento;
      if(row.data_pagamento)updates.data_pagamento=row.data_pagamento;
      if(row.flag_contabilizzato!==undefined)updates.flag_contabilizzato=(row.flag_contabilizzato==='SI'||row.flag_contabilizzato===true);
      if(row.note_contabili)updates.note_contabili=row.note_contabili;
      if(!Object.keys(updates).length)continue;
      const sets=Object.entries(updates).map(([k],i)=>`${k}=$${i+2}`).join(',');
      // Rate canone (contratti_affitto): appena arriva il numero fattura dalla contabile,
      // lo stato passa automaticamente a "fatturato" — non tocca righe di altro tipo_servizio.
      const setStatoCanone = updates.numero_fattura ? `, stato = CASE WHEN tipo_servizio='canone_locazione' THEN 'fatturato' ELSE stato END` : '';
      const r=await pool.query(`UPDATE ordini_fatturazione SET ${sets}${setStatoCanone},updated_at=NOW() WHERE ${field}=$1`,[key,...Object.values(updates)]);
      if(r.rowCount>0) updated++; else notFound++;
    }catch(e){errors.push({row:row.numero_fattura||row.id,error:e.message});}
  }
  res.json({updated,notFound,errors});
});

router.get('/api/fatturazione/istat-alert', authMiddleware, async (req, res) => {
  try {
    const r=await pool.query(`
      SELECT s.id,s.codice,s.canone_annuo,s.tipo_contratto,s.data_inizio_contratto,
        s.istat_periodicita,s.istat_percentuale,s.istat_data_ultima_revisione,
        s.istat_data_prossima_revisione,s.istat_tipo,
        sd.nome as sede,i.ragione_sociale as inquilino,
        (s.istat_data_prossima_revisione-CURRENT_DATE)::int as giorni_revisione
      FROM subs s LEFT JOIN sedi sd ON s.sede_id=sd.id LEFT JOIN inquilini i ON s.inquilino_id=i.id
      WHERE s.canone_annuo IS NOT NULL AND s.data_inizio_contratto IS NOT NULL
        AND (s.istat_data_prossima_revisione IS NULL OR s.istat_data_prossima_revisione<=CURRENT_DATE+INTERVAL '30 days')
      ORDER BY s.istat_data_prossima_revisione ASC NULLS FIRST`);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
