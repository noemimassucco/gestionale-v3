'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const { updateSaluteImmobile, generateTags, extractPriceFromText, parseDate, parsePrice } = require('../utils/helpers');
const { registraUscita, rimuoviUscita } = require('../utils/controlloFatturazione');
const { subNonAttivoErrore } = require('../utils/subGuard');

async function _registraUscitaIntervento(i){
  if (!i) return;
  let fornNome = null;
  if (i.fornitore_id) {
    const fr = await pool.query('SELECT ragione_sociale FROM fornitori WHERE id=$1', [i.fornitore_id]).catch(()=>null);
    fornNome = fr?.rows[0]?.ragione_sociale || null;
  }
  await registraUscita(pool, { origine_tipo:'intervento', origine_id:i.id, sub_id:i.sub_id||null,
    sede_id:i.sede_id||null, fornitore_nome:fornNome, descrizione:i.descrizione,
    importo:i.prezzo, data_documento:i.data_intervento||i.data_fattura, protocollo:i.protocollo, created_by:i.created_by });
}

router.get('/api/interventi', authMiddleware, async (req, res) => {
  const { sub_id, sede_id, fornitore_id, categoria_id, anno, search, tags, data_da, data_a, importo_min, importo_max } = req.query;
  let where = ['1=1'];
  const params = [];
  let p = 1;
  if (sub_id) { where.push(`i.sub_id=$${p++}`); params.push(sub_id); }
  if (sede_id) { where.push(`i.sede_id=$${p++}`); params.push(sede_id); }
  if (fornitore_id) { where.push(`i.fornitore_id=$${p++}`); params.push(fornitore_id); }
  if (categoria_id) { where.push(`i.categoria_id=$${p++}`); params.push(categoria_id); }
  if (anno) { where.push(`i.anno_fattura=$${p++}`); params.push(anno); }
  if (data_da) { where.push(`i.data_intervento>=$${p++}`); params.push(data_da); }
  if (data_a) { where.push(`i.data_intervento<=$${p++}`); params.push(data_a); }
  if (importo_min) { where.push(`i.prezzo>=$${p++}`); params.push(importo_min); }
  if (importo_max) { where.push(`i.prezzo<=$${p++}`); params.push(importo_max); }
  if (search) {
    where.push(`(i.descrizione ILIKE $${p} OR i.protocollo ILIKE $${p} OR i.num_fattura ILIKE $${p} OR f.ragione_sociale ILIKE $${p} OR s.codice ILIKE $${p} OR s.ex_sub ILIKE $${p})`);
    params.push(`%${search}%`); p++;
  }
  const r = await pool.query(`
    SELECT i.*,
      s.codice as sub_codice, s.ex_sub as sub_ex,
      sd.nome as sede_nome,
      f.ragione_sociale as fornitore_nome, f.tel as fornitore_tel,
      inq.ragione_sociale as inquilino_nome,
      cat.nome as categoria_nome, cat.colore as categoria_colore, cat.icona as categoria_icona,
      uc.nome as created_by_nome, uu.nome as updated_by_nome,
      (SELECT COUNT(*) FROM allegati WHERE intervento_id=i.id) as num_allegati
    FROM interventi i
    LEFT JOIN subs s ON i.sub_id=s.id
    LEFT JOIN sedi sd ON i.sede_id=sd.id
    LEFT JOIN fornitori f ON i.fornitore_id=f.id
    LEFT JOIN inquilini inq ON i.inquilino_id=inq.id
    LEFT JOIN categorie cat ON i.categoria_id=cat.id
    LEFT JOIN users uc ON i.created_by=uc.id
    LEFT JOIN users uu ON i.updated_by=uu.id
    WHERE ${where.join(' AND ')}
    ORDER BY i.id DESC
  `, params);
  res.json(r.rows);
});

router.get('/api/interventi/:id', authMiddleware, async (req, res) => {
  const r = await pool.query(`
    SELECT i.*,
      s.codice as sub_codice, s.ex_sub as sub_ex, s.sede_id,
      sd.nome as sede_nome,
      f.ragione_sociale as fornitore_nome, f.tel as fornitore_tel, f.email as fornitore_email,
      inq.ragione_sociale as inquilino_nome,
      cat.nome as categoria_nome, cat.colore as categoria_colore, cat.icona as categoria_icona,
      uc.nome as created_by_nome, uu.nome as updated_by_nome
    FROM interventi i
    LEFT JOIN subs s ON i.sub_id=s.id
    LEFT JOIN sedi sd ON i.sede_id=sd.id
    LEFT JOIN fornitori f ON i.fornitore_id=f.id
    LEFT JOIN inquilini inq ON i.inquilino_id=inq.id
    LEFT JOIN categorie cat ON i.categoria_id=cat.id
    LEFT JOIN users uc ON i.created_by=uc.id
    LEFT JOIN users uu ON i.updated_by=uu.id
    WHERE i.id=$1`, [req.params.id]);
  if (!r.rows.length) return res.status(404).json({ error: 'Non trovato' });
  const intervento = r.rows[0];
  // Allegati
  const allegati = await pool.query('SELECT * FROM allegati WHERE intervento_id=$1 ORDER BY created_at', [req.params.id]);
  intervento.allegati = allegati.rows;
  // Interventi simili (stesso sub, parole chiave simili)
  if (intervento.sub_id && intervento.descrizione) {
    const words = intervento.descrizione.toLowerCase().split(/\s+/).filter(w => w.length > 4).slice(0, 5);
    if (words.length) {
      const likeClause = words.map((w, i) => `descrizione ILIKE $${i + 3}`).join(' OR ');
      const simili = await pool.query(
        `SELECT id, data_intervento, descrizione, prezzo FROM interventi WHERE sub_id=$1 AND id!=$2 AND (${likeClause}) ORDER BY data_intervento DESC LIMIT 3`,
        [intervento.sub_id, intervento.id, ...words.map(w => `%${w}%`)]
      );
      intervento.interventi_simili = simili.rows;
    }
  }
  res.json(intervento);
});

router.post('/api/interventi', authMiddleware, async (req, res) => {
  const v = req.body;
  const subErr = await subNonAttivoErrore(pool, v.sub_id);
  if (subErr) return res.status(400).json({ error: subErr });
  if (v.prezzo !== undefined && v.prezzo !== null && v.prezzo !== '' && parseFloat(v.prezzo) < 0) {
    return res.status(400).json({ error: 'Prezzo non può essere negativo' });
  }
  const { tags, hasNotifica } = generateTags(v.descrizione, v.note);
  const r = await pool.query(`
    INSERT INTO interventi (sub_id,sede_id,fornitore_id,inquilino_id,categoria_id,protocollo,num_fattura,
      data_intervento,data_fattura,anno_fattura,prezzo,descrizione,note,tags,ha_notifica,created_by,updated_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16) RETURNING *`,
    [v.sub_id||null, v.sede_id||null, v.fornitore_id||null, v.inquilino_id||null, v.categoria_id||null,
     v.protocollo||null, v.num_fattura||null, v.data_intervento||null, v.data_fattura||null,
     v.anno_fattura||null, v.prezzo||null, v.descrizione||null, v.note||null, tags, hasNotifica, req.user.id]
  );
  // Ricalcola salute SUB
  if (v.sub_id) await updateSaluteImmobile(v.sub_id);
  await _registraUscitaIntervento(r.rows[0]);
  res.json(r.rows[0]);
});

router.put('/api/interventi/:id', authMiddleware, async (req, res) => {
  const v = req.body;
  if (v.prezzo !== undefined && v.prezzo !== null && v.prezzo !== '' && parseFloat(v.prezzo) < 0) {
    return res.status(400).json({ error: 'Prezzo non può essere negativo' });
  }
  const { tags, hasNotifica } = generateTags(v.descrizione, v.note);
  const r = await pool.query(`
    UPDATE interventi SET sub_id=$1,sede_id=$2,fornitore_id=$3,inquilino_id=$4,categoria_id=$5,
      protocollo=$6,num_fattura=$7,data_intervento=$8,data_fattura=$9,anno_fattura=$10,
      prezzo=$11,descrizione=$12,note=$13,tags=$14,ha_notifica=$15,updated_by=$16,updated_at=NOW()
    WHERE id=$17 RETURNING *`,
    [v.sub_id||null, v.sede_id||null, v.fornitore_id||null, v.inquilino_id||null, v.categoria_id||null,
     v.protocollo||null, v.num_fattura||null, v.data_intervento||null, v.data_fattura||null,
     v.anno_fattura||null, v.prezzo||null, v.descrizione||null, v.note||null, tags, hasNotifica, req.user.id, req.params.id]
  );
  if (v.sub_id) await updateSaluteImmobile(v.sub_id);
  await _registraUscitaIntervento(r.rows[0]);
  res.json(r.rows[0]);
});

router.delete('/api/interventi/:id', authMiddleware, async (req, res) => {
  const inv = await pool.query('SELECT sub_id FROM interventi WHERE id=$1', [req.params.id]);
  await pool.query('DELETE FROM interventi WHERE id=$1', [req.params.id]);
  if (inv.rows[0]?.sub_id) await updateSaluteImmobile(inv.rows[0].sub_id);
  await rimuoviUscita(pool, 'intervento', req.params.id);
  res.json({ ok: true });
});

router.post('/api/interventi/delete-bulk', authMiddleware, async (req, res) => {
  const { ids } = req.body;
  if (!ids?.length) return res.json({ deleted: 0 });
  const subIds = (await pool.query('SELECT DISTINCT sub_id FROM interventi WHERE id=ANY($1)', [ids])).rows.map(r => r.sub_id).filter(Boolean);
  await pool.query('DELETE FROM interventi WHERE id=ANY($1)', [ids]);
  await pool.query('DELETE FROM controllo_fatturazione WHERE origine_tipo=$1 AND origine_id=ANY($2)', ['intervento', ids]).catch(()=>{});
  for (const subId of subIds) await updateSaluteImmobile(subId);
  res.json({ deleted: ids.length });
});

router.post('/api/interventi/check-duplicate', authMiddleware, async (req, res) => {
  const { sub_id, fornitore_id, descrizione } = req.body;
  const r = await pool.query('SELECT * FROM interventi WHERE sub_id=$1 AND fornitore_id=$2', [sub_id, fornitore_id]);
  const words = (descrizione || '').toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const similar = r.rows.filter(x => {
    const d = (x.descrizione || '').toLowerCase();
    return words.length && words.filter(w => d.includes(w)).length / words.length > 0.4;
  });
  res.json({ duplicates: similar });
});

router.post('/api/interventi/extract-prices', authMiddleware, async (req, res) => {
  const rows = await pool.query(`SELECT id, descrizione, note FROM interventi WHERE (prezzo IS NULL OR prezzo = 0)`);
  let updated = 0;
  for (const row of rows.rows) {
    const prezzo = extractPriceFromText(row.descrizione) || extractPriceFromText(row.note);
    if (prezzo) {
      await pool.query('UPDATE interventi SET prezzo=$1 WHERE id=$2', [prezzo, row.id]);
      updated++;
    }
  }
  // Ricalcola salute tutti i SUB
  const subs = await pool.query('SELECT DISTINCT id FROM subs');
  for (const s of subs.rows) await updateSaluteImmobile(s.id);
  res.json({ updated });
});

router.post('/api/interventi/import-storico', authMiddleware, async (req, res) => {
  const { rows } = req.body;
  if(!rows?.length) return res.json({ added:0, errors:[] });
  const client = await pool.connect();
  let added=0, errors=[];
  try {
    await client.query('BEGIN');
    // Cache all lookup tables once
    const [fornitori,inquilini,subs,sedi] = await Promise.all([
      client.query('SELECT id,ragione_sociale FROM fornitori').then(r=>r.rows),
      client.query('SELECT id,ragione_sociale FROM inquilini').then(r=>r.rows),
      client.query('SELECT id,codice,ex_sub,sede_id FROM subs').then(r=>r.rows),
      client.query('SELECT id,nome FROM sedi').then(r=>r.rows),
    ]);

    const norm=s=>(s||'').toLowerCase().trim().replace(/\s+/g,' ');
    const findOrCreate=async(table,arr,nome)=>{
      if(!nome?.trim())return null;
      const n=norm(nome);
      // Solo corrispondenza esatta: un match per sottostringa (es. "Costruzioni" agganciato
      // a "Rossi Costruzioni SRL") rischiava di accreditare spese/interventi al fornitore o
      // inquilino sbagliato senza alcun avviso. Se non c'è un nome identico si crea un nuovo
      // record (eventualmente da fondere a mano dopo) invece di indovinare.
      let found=arr.find(x=>norm(x.ragione_sociale)===n);
      if(found)return found.id;
      const r=await client.query(`INSERT INTO ${table} (ragione_sociale) VALUES ($1) ON CONFLICT DO NOTHING RETURNING *`,[nome.trim()]);
      if(r.rows.length){arr.push(r.rows[0]);return r.rows[0].id;}
      return null;
    };
    const parseDate=d=>{
      if(!d)return null;
      const s=String(d).trim();
      if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
      if(/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(s)){const[dd,mm,yy]=s.split(/[\/\-]/);return`${yy}-${mm}-${dd}`;}
      if(/^\d{2}[\/\-]\d{2}[\/\-]\d{2}$/.test(s)){const[dd,mm,yy]=s.split(/[\/\-]/);return`20${yy}-${mm}-${dd}`;}
      // Excel serial number
      if(/^\d{5}$/.test(s)){const d=new Date(Math.round((parseInt(s)-25569)*86400*1000));return d.toISOString().split('T')[0];}
      return null;
    };
    const parsePrice=v=>{
      if(!v)return null;
      if(typeof v==='number')return v;
      let s=String(v).replace(/[€$£\s]/g,'').trim();
      if(!s)return null;
      const hasComma=s.includes(','), hasDot=s.includes('.');
      if(hasComma&&hasDot){
        // Formato italiano "1.234,56" → 1234.56 (punto=migliaia, virgola=decimali)
        s=s.replace(/\./g,'').replace(',','.');
      }else if(hasComma){
        s=s.replace(',','.');
      }else if(hasDot){
        // Solo punto: se dopo l'ultimo punto ci sono 3 cifre è quasi certo il separatore delle
        // migliaia ("1.500" = 1500), non un decimale — prima veniva letto 1000 volte più piccolo.
        const parts=s.split('.');
        if(parts.length>1 && parts[parts.length-1].length===3) s=parts.join('');
      }
      const n=parseFloat(s);
      return isNaN(n)?null:n;
    };

    for(const row of rows){
      try{
        const subNorm=norm(row.sub_codice);
        const sub=subs.find(s=>norm(s.codice)===subNorm)||subs.find(s=>norm(s.ex_sub||'')===subNorm&&subNorm);
        const sede=row.location?sedi.find(s=>norm(s.nome).includes(norm(row.location))||norm(row.location).includes(norm(s.nome))):null;
        const fornitore_id=await findOrCreate('fornitori',fornitori,row.fornitore_nome);
        const inquilino_id=row.inquilino_nome?await findOrCreate('inquilini',inquilini,row.inquilino_nome):null;
        const{tags,hasNotifica}=generateTags(row.descrizione,row.note);
        const di=parseDate(row.data_intervento),df=parseDate(row.data_fattura);
        const anno=di?parseInt(di.split('-')[0]):(df?parseInt(df.split('-')[0]):null);
        let prezzo=parsePrice(row.prezzo);
        if(!prezzo&&row.descrizione)prezzo=extractPriceFromText(row.descrizione);
        await client.query(
          `INSERT INTO interventi (sub_id,sede_id,fornitore_id,inquilino_id,protocollo,num_fattura,
           data_intervento,data_fattura,anno_fattura,prezzo,descrizione,note,tags,ha_notifica,created_by,updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15)`,
          [sub?.id||null,sede?.id||sub?.sede_id||null,fornitore_id,inquilino_id,
           row.protocollo||null,row.num_fattura||null,di,df,anno,prezzo,
           row.descrizione||null,row.note||null,tags,hasNotifica,req.user.id]);
        if(sub?.id)await updateSaluteImmobile(sub.id);
        added++;
      }catch(e){errors.push({row:row.sub_codice||'?',error:e.message});}
    }
    await client.query('COMMIT');
    res.json({added,errors});
  }catch(e){await client.query('ROLLBACK');res.status(500).json({error:e.message});}
  finally{client.release();}
});

module.exports = router;
