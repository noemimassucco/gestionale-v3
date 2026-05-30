'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const { updateSaluteImmobile } = require('../utils/helpers');

router.get('/api/subs', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT s.*,sd.nome as sede_nome,i.ragione_sociale as inquilino_nome,
        (SELECT COUNT(*) FROM interventi WHERE sub_id=s.id) as num_interventi,
        (SELECT COALESCE(SUM(prezzo),0) FROM interventi WHERE sub_id=s.id) as totale_spese,
        (SELECT COUNT(*) FROM manutenzioni WHERE sub_id=s.id AND stato='programmata') as manutenzioni_aperte,
        (SELECT COUNT(*) FROM documenti WHERE sub_id=s.id) as num_documenti
      FROM subs s
      LEFT JOIN sedi sd ON s.sede_id=sd.id
      LEFT JOIN inquilini i ON s.inquilino_id=i.id
      ORDER BY sd.nome NULLS LAST, s.codice`);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/api/subs', authMiddleware, async (req, res) => {
  const f = req.body;
  try {
    const r = await pool.query(
      `INSERT INTO subs (codice,ex_sub,sede_id,piano,inquilino_id,indirizzo_completo,foglio,particella,subalterno,
        categoria_cat,mq_commerciali,mq_calpestabili,rendita,stato_occupazione,classe_energetica,
        anno_costruzione,canone_annuo,tipo_contratto,durata_contratto_anni,data_inizio_contratto,
        note_catastali,note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING *`,
      [f.codice,f.ex_sub||null,f.sede_id||null,f.piano||null,f.inquilino_id||null,
       f.indirizzo_completo||null,f.foglio||null,f.particella||null,f.subalterno||null,
       f.categoria_cat||null,f.mq_commerciali||null,f.mq_calpestabili||null,f.rendita||null,
       f.stato_occupazione||'libero',f.classe_energetica||null,f.anno_costruzione||null,
       f.canone_annuo||null,f.tipo_contratto||null,f.durata_contratto_anni||null,
       f.data_inizio_contratto||null,f.note_catastali||null,f.note||null]);
    await pool.query('INSERT INTO sub_storia (sub_id,tipo,titolo,descrizione,created_by) VALUES ($1,$2,$3,$4,$5)',
      [r.rows[0].id,'creazione','SUB creato',`Nuovo SUB ${f.codice}`,req.user.id]);
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/api/subs/:id', authMiddleware, async (req, res) => {
  const f = req.body;
  try {
    const r = await pool.query(
      `UPDATE subs SET codice=$1,ex_sub=$2,sede_id=$3,piano=$4,inquilino_id=$5,indirizzo_completo=$6,
        foglio=$7,particella=$8,subalterno=$9,categoria_cat=$10,mq_commerciali=$11,mq_calpestabili=$12,
        rendita=$13,stato_occupazione=$14,classe_energetica=$15,anno_costruzione=$16,canone_annuo=$17,
        tipo_contratto=$18,durata_contratto_anni=$19,data_inizio_contratto=$20,note_catastali=$21,note=$22,
        updated_at=NOW() WHERE id=$23 RETURNING *`,
      [f.codice,f.ex_sub||null,f.sede_id||null,f.piano||null,f.inquilino_id||null,
       f.indirizzo_completo||null,f.foglio||null,f.particella||null,f.subalterno||null,
       f.categoria_cat||null,f.mq_commerciali||null,f.mq_calpestabili||null,f.rendita||null,
       f.stato_occupazione||'libero',f.classe_energetica||null,f.anno_costruzione||null,
       f.canone_annuo||null,f.tipo_contratto||null,f.durata_contratto_anni||null,
       f.data_inizio_contratto||null,f.note_catastali||null,f.note||null,req.params.id]);
    await updateSaluteImmobile(req.params.id);
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/api/subs/:id', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const id = req.params.id;
    await client.query('DELETE FROM pagamenti_affitto WHERE sub_id=$1', [id]);
    await client.query('DELETE FROM storico_inquilini WHERE sub_id=$1', [id]);
    await client.query('DELETE FROM bollette WHERE sub_id=$1', [id]);
    await client.query('DELETE FROM ticket WHERE sub_id=$1', [id]);
    await client.query('DELETE FROM manutenzioni WHERE sub_id=$1', [id]);
    await client.query('UPDATE documenti SET sub_id=NULL WHERE sub_id=$1', [id]);
    await client.query('UPDATE interventi SET sub_id=NULL WHERE sub_id=$1', [id]);
    await client.query('DELETE FROM sub_storia WHERE sub_id=$1', [id]);
    await client.query('DELETE FROM sub_relazioni WHERE sub_padre=$1 OR sub_figlio=$1', [id]);
    await client.query('UPDATE ordini_fatturazione SET sub_id=NULL WHERE sub_id=$1', [id]);
    await client.query('DELETE FROM subs WHERE id=$1', [id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch(e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

router.post('/api/subs/import-bulk', authMiddleware, async (req, res) => {
  const { rows } = req.body;
  if (!rows?.length) return res.json({ added: 0, updated: 0, errors: [] });
  const client = await pool.connect();
  let added = 0, updated = 0, errors = [];
  try {
    await client.query('BEGIN');
    const sedi = (await client.query('SELECT id,nome FROM sedi')).rows;
    const norm = s => (s||'').toLowerCase().trim();
    for (const row of rows) {
      try {
        const codice = String(row.codice||'').trim();
        if (!codice) { errors.push({ row: 'riga senza codice', error: 'Codice SUB obbligatorio' }); continue; }
        const sedeNome = String(row.sede||'').trim();
        let sede_id = null;
        if (sedeNome) {
          let sede = sedi.find(s => norm(s.nome) === norm(sedeNome));
          if (!sede) {
            const ns = await client.query('INSERT INTO sedi (nome) VALUES ($1) ON CONFLICT DO NOTHING RETURNING *', [sedeNome]);
            if (ns.rows.length) { sede = ns.rows[0]; sedi.push(sede); }
          }
          sede_id = sede?.id || null;
        }
        const existing = await client.query('SELECT id FROM subs WHERE codice=$1', [codice]);
        if (existing.rows.length) {
          await client.query(
            'UPDATE subs SET sede_id=COALESCE($1,sede_id),piano=COALESCE($2,piano),indirizzo_completo=COALESCE($3,indirizzo_completo),foglio=COALESCE($4,foglio),particella=COALESCE($5,particella),subalterno=COALESCE($6,subalterno),categoria_cat=COALESCE($7,categoria_cat),mq_commerciali=COALESCE($8::numeric,mq_commerciali),mq_calpestabili=COALESCE($9::numeric,mq_calpestabili),rendita=COALESCE($10::numeric,rendita),stato_occupazione=COALESCE($11,stato_occupazione),classe_energetica=COALESCE($12,classe_energetica),anno_costruzione=COALESCE($13::int,anno_costruzione),millesimi=COALESCE($14::numeric,millesimi) WHERE id=$15',
            [sede_id,row.piano||null,row.indirizzo_completo||null,row.foglio||null,row.particella||null,row.subalterno||null,row.categoria_cat||null,row.mq_commerciali||null,row.mq_calpestabili||null,row.rendita||null,row.stato_occupazione||null,row.classe_energetica||null,row.anno_costruzione||null,existing.rows[0].id]
          );
          updated++;
        } else {
          const nr = await client.query(
            `INSERT INTO subs (codice,ex_sub,sede_id,piano,indirizzo_completo,foglio,particella,subalterno,categoria_cat,mq_commerciali,mq_calpestabili,rendita,stato_occupazione,classe_energetica,anno_costruzione,note)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
            [codice,row.ex_sub||null,sede_id,row.piano||null,row.indirizzo_completo||null,row.foglio||null,row.particella||null,row.subalterno||null,row.categoria_cat||null,row.mq_commerciali||null,row.mq_calpestabili||null,row.rendita||null,row.stato_occupazione||'libero',row.classe_energetica||null,row.anno_costruzione||null,row.note||null]
          );
          await client.query('INSERT INTO sub_storia (sub_id,tipo,titolo,descrizione,created_by) VALUES ($1,$2,$3,$4,$5)',
            [nr.rows[0].id,'creazione','SUB importato',`Import bulk — ${codice}`,req.user.id]);
          added++;
        }
      } catch(e) { errors.push({ row: row.codice||'?', error: e.message }); }
    }
    await client.query('COMMIT');
    res.json({ added, updated, errors });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

router.get('/api/subs/:id/detail', authMiddleware, async (req, res) => {
  const id = req.params.id;
  try {
    const [subR, interventiR, documentiR, manutenzioniR, storiaR, pagamentiR, storInqR] = await Promise.all([
      pool.query(`SELECT s.*,sd.nome as sede_nome,i.ragione_sociale as inquilino_nome,i.tel as inquilino_tel,i.email as inquilino_email,
        (SELECT COUNT(*) FROM interventi WHERE sub_id=s.id) as num_interventi,
        (SELECT COALESCE(SUM(prezzo),0) FROM interventi WHERE sub_id=s.id) as totale_spese,
        (SELECT COUNT(*) FROM manutenzioni WHERE sub_id=s.id AND stato='programmata') as manutenzioni_aperte,
        (SELECT COUNT(*) FROM documenti WHERE sub_id=s.id) as num_documenti
        FROM subs s LEFT JOIN sedi sd ON s.sede_id=sd.id LEFT JOIN inquilini i ON s.inquilino_id=i.id WHERE s.id=$1`, [id]),
      pool.query(`SELECT i.*,f.ragione_sociale as fornitore_nome,cat.nome as categoria_nome,cat.icona,u.nome as autore
        FROM interventi i LEFT JOIN fornitori f ON i.fornitore_id=f.id LEFT JOIN categorie cat ON i.categoria_id=cat.id
        LEFT JOIN users u ON i.created_by=u.id WHERE i.sub_id=$1 ORDER BY COALESCE(i.data_intervento,'1900-01-01') DESC LIMIT 20`, [id]),
      pool.query(`SELECT d.*,f.ragione_sociale as fornitore_nome FROM documenti d LEFT JOIN fornitori f ON d.fornitore_id=f.id WHERE d.sub_id=$1 ORDER BY d.created_at DESC`, [id]),
      pool.query(`SELECT m.*,f.ragione_sociale as fornitore_nome FROM manutenzioni m LEFT JOIN fornitori f ON m.fornitore_id=f.id WHERE m.sub_id=$1 ORDER BY m.prossima_scadenza ASC NULLS LAST`, [id]),
      pool.query(`SELECT ss.*,u.nome as autore FROM sub_storia ss LEFT JOIN users u ON ss.created_by=u.id WHERE ss.sub_id=$1 ORDER BY ss.created_at DESC LIMIT 50`, [id]),
      pool.query(`SELECT p.*,i.ragione_sociale as inquilino_nome FROM pagamenti_affitto p LEFT JOIN inquilini i ON p.inquilino_id=i.id WHERE p.sub_id=$1 ORDER BY p.anno DESC, p.mese DESC`, [id]),
      pool.query(`SELECT si.*,i.ragione_sociale as inquilino_nome,i.tel,i.email FROM storico_inquilini si LEFT JOIN inquilini i ON si.inquilino_id=i.id WHERE si.sub_id=$1 ORDER BY si.data_inizio DESC NULLS LAST`, [id]),
    ]);
    if (!subR.rows.length) return res.status(404).json({ error: 'SUB non trovato' });

    const costiR = await pool.query(`SELECT anno_fattura as anno,COALESCE(SUM(prezzo),0) as totale,COUNT(*) as num FROM interventi WHERE sub_id=$1 AND anno_fattura IS NOT NULL GROUP BY anno_fattura ORDER BY anno DESC LIMIT 5`, [id]);
    const costiFornR = await pool.query(`SELECT f.ragione_sociale as fornitore,COALESCE(SUM(i.prezzo),0) as totale,COUNT(i.id) as num FROM interventi i LEFT JOIN fornitori f ON i.fornitore_id=f.id WHERE i.sub_id=$1 GROUP BY f.ragione_sociale ORDER BY totale DESC LIMIT 5`, [id]);
    const scadenzeR = await pool.query(`
      SELECT 'documento' as tipo,nome,scadenza,(scadenza-CURRENT_DATE) as giorni FROM documenti WHERE sub_id=$1 AND scadenza IS NOT NULL AND scadenza >= CURRENT_DATE
      UNION ALL SELECT 'manutenzione',tipo,prossima_scadenza,(prossima_scadenza-CURRENT_DATE) FROM manutenzioni WHERE sub_id=$1 AND prossima_scadenza IS NOT NULL AND stato!='annullata' AND prossima_scadenza >= CURRENT_DATE
      ORDER BY scadenza ASC LIMIT 10`, [id]);

    const pagamenti = pagamentiR.rows;
    const totEntrate = pagamenti.reduce((s,p)=>s+(parseFloat(p.importo)||0),0);
    const totUscite = parseFloat(subR.rows[0].totale_spese||0) + manutenzioniR.rows.reduce((s,m)=>s+(parseFloat(m.costo)||0),0);
    const entratePerAnno = {};
    pagamenti.forEach(p=>{if(!entratePerAnno[p.anno])entratePerAnno[p.anno]=0;entratePerAnno[p.anno]+=parseFloat(p.importo)||0;});

    res.json({
      sub: subR.rows[0], interventi: interventiR.rows, documenti: documentiR.rows,
      manutenzioni: manutenzioniR.rows, storia: storiaR.rows, costiAnno: costiR.rows,
      costiFornitore: costiFornR.rows, scadenze: scadenzeR.rows, pagamenti,
      storicoInquilini: storInqR.rows,
      economico: { totEntrate, totUscite, profittoNetto: totEntrate - totUscite, entratePerAnno },
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/api/subs/:id/storia', authMiddleware, async (req, res) => {
  const subId = req.params.id;
  // Storia modifiche
  const storia = await pool.query(
    'SELECT ss.*,u.nome as autore FROM sub_storia ss LEFT JOIN users u ON ss.created_by=u.id WHERE ss.sub_id=$1 ORDER BY ss.created_at DESC',
    [subId]
  );
  // Interventi (come eventi timeline)
  const interventi = await pool.query(`
    SELECT i.id,i.data_intervento,i.data_fattura,i.descrizione,i.prezzo,i.protocollo,
      f.ragione_sociale as fornitore,cat.nome as categoria,cat.icona,u.nome as autore,
      i.created_at
    FROM interventi i
    LEFT JOIN fornitori f ON i.fornitore_id=f.id
    LEFT JOIN categorie cat ON i.categoria_id=cat.id
    LEFT JOIN users u ON i.created_by=u.id
    WHERE i.sub_id=$1 ORDER BY COALESCE(i.data_intervento,i.created_at::date) DESC`, [subId]);
  // Documenti collegati
  const docs = await pool.query(
    'SELECT d.*,f.ragione_sociale as fornitore,u.nome as autore FROM documenti d LEFT JOIN fornitori f ON d.fornitore_id=f.id LEFT JOIN users u ON d.created_by=u.id WHERE d.sub_id=$1 ORDER BY d.created_at DESC',
    [subId]
  );
  // Unisci e ordina timeline
  const timeline = [
    ...storia.rows.map(x => ({ ...x, _tipo: 'storia', _data: x.created_at })),
    ...interventi.rows.map(x => ({ ...x, _tipo: 'intervento', _data: x.data_intervento || x.created_at })),
    ...docs.rows.map(x => ({ ...x, _tipo: 'documento', _data: x.data_documento || x.created_at })),
  ].sort((a, b) => new Date(b._data) - new Date(a._data));
  res.json(timeline);
});

router.post('/api/subs/:id/storia', authMiddleware, async (req, res) => {
  const { tipo, titolo, descrizione } = req.body;
  const r = await pool.query(
    'INSERT INTO sub_storia (sub_id,tipo,titolo,descrizione,created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [req.params.id, tipo||'nota', titolo||'Nota', descrizione||'', req.user.id]
  );
  res.json(r.rows[0]);
});

router.post('/api/subs/:id/cambia-inquilino', authMiddleware, async (req, res) => {
  const { nuovo_inquilino_id, data_cambio, canone_mensile, tipo_contratto, note } = req.body;
  const sub = await pool.query('SELECT * FROM subs WHERE id=$1', [req.params.id]);
  if (!sub.rows.length) return res.status(404).json({ error: 'SUB non trovato' });
  const s = sub.rows[0];
  // Chiude storico precedente se esiste
  if (s.inquilino_id) {
    await pool.query('UPDATE storico_inquilini SET data_fine=$1 WHERE sub_id=$2 AND data_fine IS NULL', [data_cambio, req.params.id]);
  }
  // Aggiorna SUB
  await pool.query('UPDATE subs SET inquilino_id=$1 WHERE id=$2', [nuovo_inquilino_id||null, req.params.id]);
  // Crea nuovo record storico
  if (nuovo_inquilino_id) {
    await pool.query('INSERT INTO storico_inquilini (sub_id,inquilino_id,data_inizio,canone_mensile,tipo_contratto,note,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [req.params.id, nuovo_inquilino_id, data_cambio||null, canone_mensile||null, tipo_contratto||null, note||null, req.user.id]);
  }
  const nuovaSub = await pool.query('SELECT * FROM subs WHERE id=$1', [req.params.id]);
  res.json(nuovaSub.rows[0]);
});

router.post('/api/subs/fusione', authMiddleware, async (req, res) => {
  const {sub_id_1,sub_id_2,nuovo_codice,note_fusione}=req.body;
  if(!sub_id_1||!sub_id_2||!nuovo_codice) return res.status(400).json({error:'Parametri mancanti'});
  const [s1,s2]=await Promise.all([
    pool.query('SELECT * FROM subs WHERE id=$1',[sub_id_1]),
    pool.query('SELECT * FROM subs WHERE id=$1',[sub_id_2]),
  ]);
  if(!s1.rows.length||!s2.rows.length) return res.status(404).json({error:'SUB non trovati'});
  const a=s1.rows[0],b=s2.rows[0];
  // Crea nuovo SUB risultante
  const nuovo=await pool.query(
    `INSERT INTO subs (codice,ex_sub,sede_id,piano,inquilino_id,foglio,particella,categoria_cat,classe_energetica,anno_costruzione,indirizzo_completo,stato_occupazione,note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [nuovo_codice,`${a.codice}+${b.codice}`,a.sede_id,a.piano,a.inquilino_id,a.foglio,a.particella,
     a.categoria_cat,a.classe_energetica,a.anno_costruzione,a.indirizzo_completo,a.stato_occupazione,note_fusione||null]);
  const nid=nuovo.rows[0].id;
  // Registra relazioni genealogiche
  await pool.query('INSERT INTO sub_relazioni (sub_padre,sub_figlio,tipo,data,note,created_by) VALUES ($1,$2,$3,$4,$5,$6)',
    [sub_id_1,nid,'fusione',new Date().toISOString().split('T')[0],note_fusione||null,req.user.id]);
  await pool.query('INSERT INTO sub_relazioni (sub_padre,sub_figlio,tipo,data,note,created_by) VALUES ($1,$2,$3,$4,$5,$6)',
    [sub_id_2,nid,'fusione',new Date().toISOString().split('T')[0],note_fusione||null,req.user.id]);
  // Storia su tutti i SUB
  const desc=`Fusione SUB ${a.codice} + ${b.codice} → ${nuovo_codice}. ${note_fusione||''}`;
  await pool.query('INSERT INTO sub_storia (sub_id,tipo,titolo,descrizione,created_by) VALUES ($1,$2,$3,$4,$5)',
    [sub_id_1,'fusione',`Fusione con ${b.codice} → ${nuovo_codice}`,desc,req.user.id]);
  await pool.query('INSERT INTO sub_storia (sub_id,tipo,titolo,descrizione,created_by) VALUES ($1,$2,$3,$4,$5)',
    [sub_id_2,'fusione',`Fusione con ${a.codice} → ${nuovo_codice}`,desc,req.user.id]);
  await pool.query('INSERT INTO sub_storia (sub_id,tipo,titolo,descrizione,created_by) VALUES ($1,$2,$3,$4,$5)',
    [nid,'creazione',`Creato da fusione ${a.codice} + ${b.codice}`,desc,req.user.id]);
  // Registra scissione in sub_relazioni per scissione già esistente
  await pool.query('INSERT INTO sub_relazioni (sub_padre,sub_figlio,tipo,data,note,created_by) VALUES ($1,$2,$3,$4,$5,$6)',
    [sub_id_1,nid,'fusione_origine',new Date().toISOString().split('T')[0],null,req.user.id]).catch(()=>{});
  res.json({s1:a,s2:b,nuovo:nuovo.rows[0]});
});

router.post('/api/subs/:id/scissione', authMiddleware, async (req, res) => {
  const { nuovo_codice, note_scissione } = req.body;
  if (!nuovo_codice) return res.status(400).json({ error: 'Codice nuovo SUB obbligatorio' });
  const orig = await pool.query('SELECT * FROM subs WHERE id=$1', [req.params.id]);
  if (!orig.rows.length) return res.status(404).json({ error: 'SUB non trovato' });
  const s = orig.rows[0];
  // Crea nuovo SUB derivato
  const nuovo = await pool.query(
    `INSERT INTO subs (codice,ex_sub,sede_id,piano,foglio,particella,categoria_cat,classe_energetica,anno_costruzione,indirizzo_completo,stato_occupazione,note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [nuovo_codice, s.codice, s.sede_id, s.piano, s.foglio, s.particella, s.categoria_cat, s.classe_energetica, s.anno_costruzione, s.indirizzo_completo, 'libero', note_scissione||null]
  );
  // Registra storia entrambi i SUB
  const desc = `Scissione da SUB ${s.codice}. ${note_scissione||''}`;
  await pool.query('INSERT INTO sub_storia (sub_id,tipo,titolo,descrizione,created_by) VALUES ($1,$2,$3,$4,$5)',
    [req.params.id, 'scissione', `Scissione → SUB ${nuovo_codice}`, desc, req.user.id]);
  await pool.query('INSERT INTO sub_storia (sub_id,tipo,titolo,descrizione,created_by) VALUES ($1,$2,$3,$4,$5)',
    [nuovo.rows[0].id, 'creazione', `Creato da scissione SUB ${s.codice}`, desc, req.user.id]);
  res.json({ originale: s, nuovo: nuovo.rows[0] });
});

router.get('/api/subs/:id/genealogia', authMiddleware, async (req, res) => {
  const id=req.params.id;
  const [padri,figli,sub]=await Promise.all([
    pool.query(`SELECT r.*,s.codice as codice_padre,s.stato_salute FROM sub_relazioni r LEFT JOIN subs s ON r.sub_padre=s.id WHERE r.sub_figlio=$1`,[id]),
    pool.query(`SELECT r.*,s.codice as codice_figlio,s.stato_salute FROM sub_relazioni r LEFT JOIN subs s ON r.sub_figlio=s.id WHERE r.sub_padre=$1`,[id]),
    pool.query(`SELECT id,codice,ex_sub,stato_salute FROM subs WHERE id=$1`,[id]),
  ]);
  res.json({sub:sub.rows[0],padri:padri.rows,figli:figli.rows});
});

router.put('/api/subs/:id/istat', authMiddleware, async (req, res) => {
  const {periodicita,percentuale,data_ultima,data_prossima,tipo,note}=req.body;
  const r=await pool.query(
    `UPDATE subs SET istat_periodicita=$1,istat_percentuale=$2,istat_data_ultima_revisione=$3,istat_data_prossima_revisione=$4,istat_tipo=$5,istat_note=$6 WHERE id=$7 RETURNING *`,
    [periodicita||'12_mesi',percentuale||null,data_ultima||null,data_prossima||null,tipo||'automatico',note||null,req.params.id]);
  res.json(r.rows[0]);
});

module.exports = router;
