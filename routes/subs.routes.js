'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const { updateSaluteImmobile } = require('../utils/helpers');
const { subNonAttivoErroreDaRiga } = require('../utils/subGuard');

router.get('/api/subs', authMiddleware, async (req, res) => {
  // Query ottimizzata: JOIN aggregati invece di 4 subquery correlate per riga
  const SQL = `
    SELECT s.*,
      sd.nome AS sede_nome,
      i.ragione_sociale AS inquilino_nome,
      COALESCE(ds.codice, '') AS sub_destinazione_codice,
      COALESCE(agg.num_interventi, 0)  AS num_interventi,
      COALESCE(agg.totale_spese, 0)    AS totale_spese,
      COALESCE(man.manutenzioni_aperte, 0) AS manutenzioni_aperte,
      COALESCE(doc.num_documenti, 0)   AS num_documenti,
      ft.foto_url
    FROM subs s
    LEFT JOIN sedi      sd  ON s.sede_id             = sd.id
    LEFT JOIN inquilini i   ON s.inquilino_id        = i.id
    LEFT JOIN subs      ds  ON s.sub_destinazione_id = ds.id
    LEFT JOIN (
      SELECT sub_id,
             COUNT(*)             AS num_interventi,
             COALESCE(SUM(prezzo), 0) AS totale_spese
      FROM interventi GROUP BY sub_id
    ) agg ON agg.sub_id = s.id
    LEFT JOIN (
      SELECT sub_id, COUNT(*) AS manutenzioni_aperte
      FROM manutenzioni WHERE stato = 'programmata' GROUP BY sub_id
    ) man ON man.sub_id = s.id
    LEFT JOIN (
      SELECT sub_id, COUNT(*) AS num_documenti
      FROM documenti GROUP BY sub_id
    ) doc ON doc.sub_id = s.id
    LEFT JOIN LATERAL (
      SELECT url AS foto_url FROM documenti
      WHERE sub_id = s.id AND tipo LIKE 'foto%' AND url IS NOT NULL
      ORDER BY created_at DESC LIMIT 1
    ) ft ON true
    ORDER BY sd.nome, s.codice
  `;

  const SQL_FALLBACK = `
    SELECT s.*,
      sd.nome AS sede_nome,
      i.ragione_sociale AS inquilino_nome,
      '' AS sub_destinazione_codice,
      'attivo' AS stato_sub,
      COALESCE(agg.num_interventi, 0)  AS num_interventi,
      COALESCE(agg.totale_spese, 0)    AS totale_spese,
      COALESCE(man.manutenzioni_aperte, 0) AS manutenzioni_aperte,
      COALESCE(doc.num_documenti, 0)   AS num_documenti
    FROM subs s
    LEFT JOIN sedi      sd  ON s.sede_id      = sd.id
    LEFT JOIN inquilini i   ON s.inquilino_id = i.id
    LEFT JOIN (
      SELECT sub_id, COUNT(*) AS num_interventi, COALESCE(SUM(prezzo),0) AS totale_spese
      FROM interventi GROUP BY sub_id
    ) agg ON agg.sub_id = s.id
    LEFT JOIN (
      SELECT sub_id, COUNT(*) AS manutenzioni_aperte
      FROM manutenzioni WHERE stato='programmata' GROUP BY sub_id
    ) man ON man.sub_id = s.id
    LEFT JOIN (
      SELECT sub_id, COUNT(*) AS num_documenti FROM documenti GROUP BY sub_id
    ) doc ON doc.sub_id = s.id
    ORDER BY sd.nome, s.codice
  `;

  try {
    const r = await pool.query(SQL);
    res.json(r.rows);
  } catch(e) {
    console.error('⚠️ GET /api/subs (query principale) fallita:', e.message);
    // Colonne P18-20 non ancora migrate → usa fallback senza sub_destinazione_id/stato_sub
    try {
      const r2 = await pool.query(SQL_FALLBACK);
      res.json(r2.rows);
    } catch(e2) {
      console.error('⚠️ GET /api/subs (query fallback) fallita:', e2.message);
      res.status(500).json({ error: e2.message });
    }
  }
});

router.post('/api/subs', authMiddleware, async (req, res) => {
  const f = req.body;
  try {
    // L'import in blocco già controllava i duplicati di codice, la creazione singola no:
    // si potevano creare due SUB con lo stesso codice dalla scheda normale.
    if (f.codice) {
      const dup = await pool.query('SELECT id FROM subs WHERE codice=$1', [f.codice]);
      if (dup.rows.length) {
        return res.status(400).json({ error: `Esiste già un SUB con codice "${f.codice}" (id ${dup.rows[0].id})` });
      }
    }
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

router.get('/api/subs/:id/impianti', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query('SELECT impianto, dati FROM sub_impianti WHERE sub_id=$1', [req.params.id]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/api/subs/:id/impianti/:key', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `INSERT INTO sub_impianti (sub_id, impianto, dati) VALUES ($1,$2,$3)
       ON CONFLICT (sub_id, impianto) DO UPDATE SET dati=$3, updated_at=NOW() RETURNING impianto, dati`,
      [req.params.id, req.params.key, JSON.stringify(req.body.dati || {})]);
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/api/subs/:id/millesimi', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `UPDATE subs SET millesimi=COALESCE($1::numeric,millesimi),
         spesa_cond_totale=COALESCE($2::numeric,spesa_cond_totale), updated_at=NOW()
       WHERE id=$3 RETURNING id,codice,millesimi,spesa_cond_totale`,
      [req.body.millesimi||null, req.body.spesa_cond_totale||null, req.params.id]);
    res.json(r.rows[0]||{error:'SUB non trovato'});
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/api/subs/:id', authMiddleware, async (req, res) => {
  const f = req.body;
  try {
    if (f.codice) {
      const dup = await pool.query('SELECT id FROM subs WHERE codice=$1 AND id!=$2', [f.codice, req.params.id]);
      if (dup.rows.length) {
        return res.status(400).json({ error: `Esiste già un SUB con codice "${f.codice}" (id ${dup.rows[0].id})` });
      }
    }
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
    // Prima bollette e pagamenti affitto (storico economico reale) venivano cancellati per
    // sempre senza alcun avviso — ora si blocca la cancellazione se ce ne sono ancora.
    const storico = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM bollette WHERE sub_id=$1) AS n_bollette,
        (SELECT COUNT(*) FROM pagamenti_affitto WHERE sub_id=$1) AS n_pagamenti`, [id]);
    const nBoll = parseInt(storico.rows[0]?.n_bollette || 0), nPag = parseInt(storico.rows[0]?.n_pagamenti || 0);
    if (nBoll > 0 || nPag > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Impossibile eliminare: questo SUB ha ${nBoll} bollette e ${nPag} pagamenti affitto collegati. Eliminali prima singolarmente se vuoi procedere comunque.`,
      });
    }
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
            'UPDATE subs SET ex_sub=COALESCE($16,ex_sub),sede_id=COALESCE($1,sede_id),piano=COALESCE($2,piano),indirizzo_completo=COALESCE($3,indirizzo_completo),foglio=COALESCE($4,foglio),particella=COALESCE($5,particella),subalterno=COALESCE($6,subalterno),categoria_cat=COALESCE($7,categoria_cat),mq_commerciali=COALESCE($8::numeric,mq_commerciali),mq_calpestabili=COALESCE($9::numeric,mq_calpestabili),rendita=COALESCE($10::numeric,rendita),stato_occupazione=COALESCE($11,stato_occupazione),classe_energetica=COALESCE($12,classe_energetica),anno_costruzione=COALESCE($13::int,anno_costruzione),millesimi=COALESCE($14::numeric,millesimi) WHERE id=$15',
            [sede_id,row.piano||null,row.indirizzo_completo||null,row.foglio||null,row.particella||null,row.subalterno||null,row.categoria_cat||null,row.mq_commerciali||null,row.mq_calpestabili||null,row.rendita||null,row.stato_occupazione||null,row.classe_energetica||null,row.anno_costruzione||null,row.millesimi||null,existing.rows[0].id,row.ex_sub||null]
          );
          updated++;
        } else {
          const nr = await client.query(
            `INSERT INTO subs (codice,ex_sub,sede_id,piano,indirizzo_completo,foglio,particella,subalterno,categoria_cat,mq_commerciali,mq_calpestabili,rendita,millesimi,stato_occupazione,classe_energetica,anno_costruzione,note)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
            [codice,row.ex_sub||null,sede_id,row.piano||null,row.indirizzo_completo||null,row.foglio||null,row.particella||null,row.subalterno||null,row.categoria_cat||null,row.mq_commerciali||null,row.mq_calpestabili||null,row.rendita||null,row.millesimi||null,row.stato_occupazione||'libero',row.classe_energetica||null,row.anno_costruzione||null,row.note||null]
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
    // Se questo SUB è nato da una fusione, i SUB "genitori" (marcati 'fuso' e nascosti dalle
    // viste normali) restano titolari di tutto lo storico precedente (interventi, documenti,
    // bollette, contratti, movimenti...). Prima aprendo il SUB risultante non si vedeva NULLA
    // del passato — bisognava tornare manualmente sui vecchi SUB disattivati. Ora lo storico dei
    // genitori viene incluso qui (non spostato: i record restano correttamente sul SUB fisico a
    // cui si riferivano davvero, solo "letti insieme" quando si guarda l'unità risultante).
    const genR = await pool.query(`SELECT sub_padre FROM sub_relazioni WHERE sub_figlio=$1 AND tipo='fusione'`, [id]);
    const padriIds = genR.rows.map(r => r.sub_padre);
    const idsStorico = [parseInt(id), ...padriIds];

    const [subR, interventiR, documentiR, manutenzioniR, storiaR, pagamentiR, storInqR, contrattiR, bolletteEconR] = await Promise.all([
      pool.query(`SELECT s.*,sd.nome as sede_nome,i.ragione_sociale as inquilino_nome,i.tel as inquilino_tel,i.email as inquilino_email,
        (SELECT COUNT(*) FROM interventi WHERE sub_id=ANY($2)) as num_interventi,
        (SELECT COALESCE(SUM(prezzo),0) FROM interventi WHERE sub_id=ANY($2)) as totale_spese,
        (SELECT COUNT(*) FROM manutenzioni WHERE sub_id=ANY($2) AND stato='programmata') as manutenzioni_aperte,
        (SELECT COUNT(*) FROM documenti WHERE sub_id=ANY($2)) as num_documenti
        FROM subs s LEFT JOIN sedi sd ON s.sede_id=sd.id LEFT JOIN inquilini i ON s.inquilino_id=i.id WHERE s.id=$1`, [id, idsStorico]),
      pool.query(`SELECT i.*,f.ragione_sociale as fornitore_nome,cat.nome as categoria_nome,cat.icona,u.nome as autore
        FROM interventi i LEFT JOIN fornitori f ON i.fornitore_id=f.id LEFT JOIN categorie cat ON i.categoria_id=cat.id
        LEFT JOIN users u ON i.created_by=u.id WHERE i.sub_id=ANY($1) ORDER BY COALESCE(i.data_intervento,'1900-01-01') DESC`, [idsStorico]),
      pool.query(`SELECT d.*,f.ragione_sociale as fornitore_nome FROM documenti d LEFT JOIN fornitori f ON d.fornitore_id=f.id WHERE d.sub_id=ANY($1) ORDER BY d.created_at DESC`, [idsStorico]),
      pool.query(`SELECT m.*,f.ragione_sociale as fornitore_nome FROM manutenzioni m LEFT JOIN fornitori f ON m.fornitore_id=f.id WHERE m.sub_id=ANY($1) ORDER BY m.prossima_scadenza ASC NULLS LAST`, [idsStorico]),
      pool.query(`SELECT ss.*,u.nome as autore FROM sub_storia ss LEFT JOIN users u ON ss.created_by=u.id WHERE ss.sub_id=ANY($1) ORDER BY ss.created_at DESC LIMIT 50`, [idsStorico]),
      pool.query(`SELECT p.*,i.ragione_sociale as inquilino_nome FROM pagamenti_affitto p LEFT JOIN inquilini i ON p.inquilino_id=i.id WHERE p.sub_id=ANY($1) ORDER BY p.anno DESC, p.mese DESC`, [idsStorico]),
      pool.query(`SELECT si.*,i.ragione_sociale as inquilino_nome,i.tel,i.email FROM storico_inquilini si LEFT JOIN inquilini i ON si.inquilino_id=i.id WHERE si.sub_id=ANY($1) ORDER BY si.data_inizio DESC NULLS LAST`, [idsStorico]),
      pool.query(`SELECT c.*,f.ragione_sociale as fornitore_nome FROM contratti c LEFT JOIN fornitori f ON c.fornitore_id=f.id WHERE c.sub_id=ANY($1) ORDER BY c.data_inizio DESC NULLS LAST`, [idsStorico]),
      // Bollette pagate: prima mancavano dal calcolo delle uscite/profitto netto qui sotto,
      // mostrando un utile più alto di quello reale (la tab "Costi" della scheda, calcolata
      // lato pagina, le includeva già — le due cifre nella stessa scheda non coincidevano).
      pool.query(`SELECT COALESCE(SUM(importo),0) as totale FROM bollette WHERE sub_id=ANY($1) AND stato='pagato'`, [idsStorico]),
    ]);
    if (!subR.rows.length) return res.status(404).json({ error: 'SUB non trovato' });

    // Allegati per gli interventi del SUB (batch, no N+1)
    const intIds = interventiR.rows.map(i => i.id);
    const allegatiR = intIds.length
      ? await pool.query(
          `SELECT id, intervento_id, tipo, nome, url, dimensione FROM allegati WHERE intervento_id = ANY($1) ORDER BY created_at`,
          [intIds]
        )
      : { rows: [] };
    // Map allegati by intervento_id
    const allegatiMap = {};
    allegatiR.rows.forEach(a => {
      if (!allegatiMap[a.intervento_id]) allegatiMap[a.intervento_id] = [];
      allegatiMap[a.intervento_id].push(a);
    });
    // Attach to interventi
    interventiR.rows.forEach(i => { i.allegati = allegatiMap[i.id] || []; });

    const costiR = await pool.query(`SELECT anno_fattura as anno,COALESCE(SUM(prezzo),0) as totale,COUNT(*) as num FROM interventi WHERE sub_id=ANY($1) AND anno_fattura IS NOT NULL GROUP BY anno_fattura ORDER BY anno DESC LIMIT 5`, [idsStorico]);
    const costiFornR = await pool.query(`SELECT f.ragione_sociale as fornitore,COALESCE(SUM(i.prezzo),0) as totale,COUNT(i.id) as num FROM interventi i LEFT JOIN fornitori f ON i.fornitore_id=f.id WHERE i.sub_id=ANY($1) GROUP BY f.ragione_sociale ORDER BY totale DESC LIMIT 5`, [idsStorico]);
    const scadenzeR = await pool.query(`
      SELECT 'documento' as tipo,nome,scadenza,(scadenza-CURRENT_DATE) as giorni FROM documenti WHERE sub_id=ANY($1) AND scadenza IS NOT NULL AND scadenza >= CURRENT_DATE
      UNION ALL SELECT 'manutenzione',tipo,prossima_scadenza,(prossima_scadenza-CURRENT_DATE) FROM manutenzioni WHERE sub_id=ANY($1) AND prossima_scadenza IS NOT NULL AND stato!='annullata' AND prossima_scadenza >= CURRENT_DATE
      ORDER BY scadenza ASC LIMIT 10`, [idsStorico]);

    const pagamenti = pagamentiR.rows;
    const totEntrate = pagamenti.reduce((s,p)=>s+(parseFloat(p.importo)||0),0);
    const totUscite = parseFloat(subR.rows[0].totale_spese||0) + manutenzioniR.rows.reduce((s,m)=>s+(parseFloat(m.costo)||0),0) + parseFloat(bolletteEconR.rows[0]?.totale||0);
    const entratePerAnno = {};
    pagamenti.forEach(p=>{if(!entratePerAnno[p.anno])entratePerAnno[p.anno]=0;entratePerAnno[p.anno]+=parseFloat(p.importo)||0;});

    res.json({
      sub: subR.rows[0], interventi: interventiR.rows, documenti: documentiR.rows,
      manutenzioni: manutenzioniR.rows, storia: storiaR.rows, costiAnno: costiR.rows,
      costiFornitore: costiFornR.rows, scadenze: scadenzeR.rows, pagamenti,
      storicoInquilini: storInqR.rows,
      contratti: contrattiR.rows,
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
  // Prima erano 4 query separate non transazionali: un errore a metà (es. rete caduta dopo
  // aver chiuso lo storico ma prima di aggiornare il SUB) poteva lasciare uno stato incoerente
  // (vecchio inquilino "chiuso" in storico ma SUB non aggiornato, o viceversa).
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sub = await client.query('SELECT * FROM subs WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!sub.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'SUB non trovato' }); }
    const s = sub.rows[0];
    // Chiude storico precedente se esiste
    if (s.inquilino_id) {
      await client.query('UPDATE storico_inquilini SET data_fine=$1 WHERE sub_id=$2 AND data_fine IS NULL', [data_cambio, req.params.id]);
    }
    // Aggiorna SUB — allinea anche stato_occupazione, altrimenti il cliente resta erroneamente
    // in "ex clienti" pur essendo ricollegato a un SUB attivo (stato attivo/ex è calcolato da questo campo)
    await client.query(
      'UPDATE subs SET inquilino_id=$1, stato_occupazione=$2 WHERE id=$3',
      [nuovo_inquilino_id||null, nuovo_inquilino_id ? 'occupato' : 'libero', req.params.id]
    );
    // Crea nuovo record storico
    if (nuovo_inquilino_id) {
      await client.query('INSERT INTO storico_inquilini (sub_id,inquilino_id,data_inizio,canone_mensile,tipo_contratto,note,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [req.params.id, nuovo_inquilino_id, data_cambio||null, canone_mensile||null, tipo_contratto||null, note||null, req.user.id]);
    }
    const nuovaSub = await client.query('SELECT * FROM subs WHERE id=$1', [req.params.id]);
    await client.query('COMMIT');
    res.json(nuovaSub.rows[0]);
  } catch(e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

router.post('/api/subs/fusione', authMiddleware, async (req, res) => {
  const { sub_padre_1_id, sub_padre_2_id, dati_nuovo_sub } = req.body;
  // Legacy field support
  const p1 = sub_padre_1_id || req.body.sub_id_1;
  const p2 = sub_padre_2_id || req.body.sub_id_2;
  const nuovoCodice = dati_nuovo_sub?.codice || req.body.nuovo_codice;

  if (!p1 || !p2 || !nuovoCodice) {
    return res.status(400).json({ error: 'sub_padre_1_id, sub_padre_2_id e dati_nuovo_sub.codice obbligatori' });
  }

  const [r1, r2] = await Promise.all([
    pool.query('SELECT * FROM subs WHERE id=$1', [p1]),
    pool.query('SELECT * FROM subs WHERE id=$1', [p2]),
  ]);
  if (!r1.rows.length || !r2.rows.length) return res.status(404).json({ error: 'SUB padre non trovati' });

  // Blocco sicurezza: padri devono essere attivi
  for (const [sub, label] of [[r1.rows[0], 'SUB 1'], [r2.rows[0], 'SUB 2']]) {
    if (sub.stato_sub && sub.stato_sub !== 'attivo') {
      return res.status(400).json({ error: `${label} non attivo (stato: ${sub.stato_sub})` });
    }
  }

  const d = dati_nuovo_sub || {};

  // Inquilino: prima la fusione non lo migrava mai — il nuovo SUB nasceva sempre "Libero",
  // mentre l'inquilino restava agganciato al vecchio SUB ora nascosto/disattivato ("inquilino
  // fantasma", ancora fatturato ma invisibile nelle viste operative). Se entrambi i SUB hanno
  // un inquilino attivo DIVERSO non si può indovinare quale tenere: si blocca e si chiede di
  // risolvere prima manualmente (es. liberare uno dei due SUB).
  let inquilinoFinale = d.inquilino_id || null;
  let statoOccFinale = d.stato_occupazione || null;
  if (!inquilinoFinale) {
    const inq1 = r1.rows[0].stato_occupazione === 'occupato' ? r1.rows[0].inquilino_id : null;
    const inq2 = r2.rows[0].stato_occupazione === 'occupato' ? r2.rows[0].inquilino_id : null;
    if (inq1 && inq2 && inq1 !== inq2) {
      return res.status(400).json({
        error: `${r1.rows[0].codice} e ${r2.rows[0].codice} hanno due inquilini attivi diversi — non si possono fondere automaticamente. Libera prima uno dei due SUB (o specifica tu quale inquilino tenere).`,
      });
    }
    inquilinoFinale = inq1 || inq2 || null;
    if (!statoOccFinale) statoOccFinale = inquilinoFinale ? 'occupato' : (d.stato_occupazione || 'libero');
  }
  if (!statoOccFinale) statoOccFinale = 'libero';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Crea il nuovo SUB risultante
    const nr = await client.query(`
      INSERT INTO subs (codice, sede_id, piano, inquilino_id,
        foglio, particella, subalterno, categoria_cat,
        mq_commerciali, mq_calpestabili, rendita,
        stato_occupazione, classe_energetica, anno_costruzione,
        canone_annuo, tipo_contratto, indirizzo_completo, note,
        stato_salute, stato_sub)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'verde','attivo')
      RETURNING *
    `, [nuovoCodice, d.sede_id||r1.rows[0].sede_id, d.piano||null, inquilinoFinale,
        d.foglio||null, d.particella||null, d.subalterno||null, d.categoria_cat||null,
        d.mq_commerciali||null, d.mq_calpestabili||null, d.rendita||null,
        statoOccFinale, d.classe_energetica||null, d.anno_costruzione||null,
        d.canone_annuo||null, d.tipo_contratto||null, d.indirizzo_completo||null,
        d.note||`Fusione di ${r1.rows[0].codice} + ${r2.rows[0].codice}`]);

    const nuovoId = nr.rows[0].id;

    // 1b. Se l'inquilino è stato ereditato da un genitore, chiudi lo storico_inquilini aperto sul
    // vecchio SUB e aprine uno nuovo sul SUB risultante — altrimenti lo storico resta "appeso" sul
    // SUB ormai fuso e invisibile, e il nuovo SUB non avrebbe alcuna riga storico_inquilini attiva.
    if (inquilinoFinale) {
      await client.query(
        `UPDATE storico_inquilini SET data_fine=CURRENT_DATE WHERE sub_id IN ($1,$2) AND inquilino_id=$3 AND data_fine IS NULL`,
        [p1, p2, inquilinoFinale]);
      await client.query(
        `INSERT INTO storico_inquilini (sub_id, inquilino_id, data_inizio, created_by) VALUES ($1,$2,CURRENT_DATE,$3)`,
        [nuovoId, inquilinoFinale, req.user.id]);
    }

    // 1c. Migra i contratti (con fornitori — es. manutenzione, assicurazione) sull'unità
    // risultante: prima restavano agganciati ai vecchi SUB nascosti, sparendo dalla vista.
    await client.query(`UPDATE contratti SET sub_id=$1 WHERE sub_id IN ($2,$3)`, [nuovoId, p1, p2]);

    // 1d. Millesimi: somma i valori CORRENTI (validi oggi) dei due SUB genitori per ogni tabella
    // millesimale e crea la riga per il nuovo SUB. Prima il nuovo SUB nasceva sempre a 0/NULL e i
    // vecchi SUB (ormai fusi/nascosti) continuavano a "pesare" nella ripartizione delle spese
    // condominiali al posto del SUB reale che li aveva sostituiti.
    const millesimiPadri = await client.query(`
      SELECT DISTINCT ON (mv.tabella_id, mv.sub_id) mv.tabella_id, mv.sub_id, mv.valore
      FROM millesimi_valori mv
      WHERE mv.sub_id IN ($1,$2) AND mv.data_validita <= CURRENT_DATE
      ORDER BY mv.tabella_id, mv.sub_id, mv.data_validita DESC, mv.updated_at DESC, mv.id DESC
    `, [p1, p2]);
    const perTabella = {};
    millesimiPadri.rows.forEach(row => {
      if (!perTabella[row.tabella_id]) perTabella[row.tabella_id] = 0;
      perTabella[row.tabella_id] += parseFloat(row.valore) || 0;
    });
    let millesimiScalare = null;
    for (const [tabellaId, somma] of Object.entries(perTabella)) {
      await client.query(
        `INSERT INTO millesimi_valori (sub_id, tabella_id, valore, data_validita, note, created_by)
         VALUES ($1,$2,$3,CURRENT_DATE,$4,$5)`,
        [nuovoId, tabellaId, somma, `Somma automatica da fusione ${r1.rows[0].codice}+${r2.rows[0].codice}`, req.user.id]);
      millesimiScalare = somma; // best-effort: se c'è una sola tabella coincide col valore giusto
    }
    if (millesimiScalare !== null) {
      await client.query('UPDATE subs SET millesimi=$1 WHERE id=$2', [millesimiScalare, nuovoId]).catch(() => {});
    }
    // Azzera i millesimi dei SUB genitori D'ORA IN POI (nuova riga a 0 datata oggi) — le spese
    // condominiali di PERIODI PASSATI continuano correttamente a usare i loro valori storici,
    // ma senza questo azzeramento i vecchi SUB (ormai fusi/nascosti) avrebbero continuato a
    // "pesare" per sempre nella ripartizione insieme al nuovo SUB, contando due volte le stesse
    // quote millesimali.
    for (const tabellaId of Object.keys(perTabella)) {
      for (const padreId of [p1, p2]) {
        await client.query(
          `INSERT INTO millesimi_valori (sub_id, tabella_id, valore, data_validita, note, created_by)
           VALUES ($1,$2,0,CURRENT_DATE,$3,$4)`,
          [padreId, tabellaId, `Azzerato: fuso in ${nuovoCodice}`, req.user.id]);
      }
    }

    // 2. Marca i padri come FUSI
    await client.query(`
      UPDATE subs SET stato_sub='fuso', data_cambio_stato=CURRENT_DATE,
        sub_destinazione_id=$1 WHERE id IN ($2,$3)
    `, [nuovoId, p1, p2]);

    // 3. sub_relazioni (padre → figlio) — usata anche per portare lo storico dei genitori
    // nella scheda del SUB risultante (vedi GET /api/subs/:id/detail)
    await client.query(`
      INSERT INTO sub_relazioni (sub_padre, sub_figlio, tipo, note)
      VALUES ($1,$3,'fusione',$4), ($2,$3,'fusione',$4)
    `, [p1, p2, nuovoId, req.body.note_fusione || null]);

    // 4. sub_storia
    const nota = req.body.note_fusione || `Fusione SUB → ${nuovoCodice}`;
    for (const [subId, titolo] of [[p1, `SUB fuso in ${nuovoCodice}`], [p2, `SUB fuso in ${nuovoCodice}`],
                                    [nuovoId, `Creato da fusione di ${r1.rows[0].codice}+${r2.rows[0].codice}`]]) {
      await client.query(`
        INSERT INTO sub_storia (sub_id, tipo, titolo, descrizione)
        VALUES ($1,'fusione',$2,$3)
      `, [subId, titolo, nota]);
    }

    await client.query('COMMIT');
    res.status(201).json({ nuovo_sub: nr.rows[0], fusionati: [r1.rows[0].codice, r2.rows[0].codice] });
  } catch(e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

router.post('/api/subs/:id/scissione', authMiddleware, async (req, res) => {
  const origId = parseInt(req.params.id);
  // Supporta sia body nuovo { sub_figlio_1, sub_figlio_2 } sia legacy { nuovo_codice }
  const { sub_figlio_1, sub_figlio_2, note_scissione } = req.body;

  const origRes = await pool.query('SELECT * FROM subs WHERE id=$1', [origId]);
  if (!origRes.rows.length) return res.status(404).json({ error: 'SUB non trovato' });
  const orig = origRes.rows[0];

  // Blocco sicurezza
  const subErr = subNonAttivoErroreDaRiga(orig);
  if (subErr) return res.status(400).json({ error: subErr });

  // Modalità legacy (un solo figlio)
  if (!sub_figlio_1 && req.body.nuovo_codice) {
    const f1 = { codice: req.body.nuovo_codice };
    const f2 = null;
    req.body.sub_figlio_1 = f1;
  }

  const figli = [sub_figlio_1, sub_figlio_2].filter(Boolean);
  if (figli.length < 1) return res.status(400).json({ error: 'Almeno un SUB figlio obbligatorio' });

  // Validazione codici
  for (const f of figli) {
    if (!f.codice) return res.status(400).json({ error: 'Ogni SUB figlio deve avere un codice' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const nuoviIds = [];

    // 1. Crea i SUB figli
    for (const f of figli) {
      const nr = await client.query(`
        INSERT INTO subs (codice, sede_id, piano, inquilino_id,
          foglio, particella, subalterno, categoria_cat,
          mq_commerciali, mq_calpestabili, rendita,
          stato_occupazione, classe_energetica, anno_costruzione,
          canone_annuo, tipo_contratto, indirizzo_completo, note,
          stato_salute, stato_sub)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'verde','attivo')
        RETURNING *
      `, [f.codice, f.sede_id||orig.sede_id, f.piano||null, f.inquilino_id||null,
          f.foglio||null, f.particella||null, f.subalterno||null, f.categoria_cat||null,
          f.mq_commerciali||null, f.mq_calpestabili||null, f.rendita||null,
          f.stato_occupazione||'libero', f.classe_energetica||null, f.anno_costruzione||null,
          f.canone_annuo||null, f.tipo_contratto||null, f.indirizzo_completo||null,
          f.note||`Scissione da ${orig.codice}`]);
      nuoviIds.push(nr.rows[0].id);

      // sub_relazioni origine → figlio
      await client.query(`
        INSERT INTO sub_relazioni (sub_padre, sub_figlio, tipo, note)
        VALUES ($1,$2,'scissione',$3)
      `, [origId, nr.rows[0].id, note_scissione||null]);

      // sub_storia figlio
      await client.query(`
        INSERT INTO sub_storia (sub_id, tipo, titolo, descrizione)
        VALUES ($1,'scissione',$2,$3)
      `, [nr.rows[0].id, `Creato da scissione di ${orig.codice}`, note_scissione||null]);
    }

    // 2. Marca l'originale come SCISSO (sub_destinazione_id = NULL per scissione)
    await client.query(`
      UPDATE subs SET stato_sub='scisso', data_cambio_stato=CURRENT_DATE
      WHERE id=$1
    `, [origId]);

    // sub_storia originale
    const figliFmt = figli.map(f=>f.codice).join(', ');
    await client.query(`
      INSERT INTO sub_storia (sub_id, tipo, titolo, descrizione)
      VALUES ($1,'scissione',$2,$3)
    `, [origId, `SUB scisso in ${figliFmt}`, note_scissione||null]);

    await client.query('COMMIT');
    res.status(201).json({ scisso: orig.codice, figli: figli.map(f=>f.codice), nuovi_ids: nuoviIds });
  } catch(e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
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

// Applica l'adeguamento ISTAT: aggiorna il canone, registra la revisione e programma la prossima
router.post('/api/subs/:id/istat/applica', authMiddleware, async (req, res) => {
  try {
    const pct = parseFloat(req.body.percentuale);
    if (isNaN(pct)) return res.status(400).json({ error: 'Percentuale ISTAT obbligatoria (es. 1.8)' });
    const cur = await pool.query('SELECT id, codice, canone_annuo, istat_periodicita FROM subs WHERE id=$1', [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'SUB non trovato' });
    const s = cur.rows[0];
    const vecchio = parseFloat(s.canone_annuo);
    if (!vecchio) return res.status(400).json({ error: 'Canone annuo non impostato: inseriscilo prima nell\'anagrafica del SUB' });
    const nuovo = Math.round(vecchio * (1 + pct / 100) * 100) / 100;
    const mesi = { '6_mesi': 6, '12_mesi': 12, '24_mesi': 24 }[s.istat_periodicita] || 12;
    const r = await pool.query(
      `UPDATE subs SET canone_annuo=$1, istat_percentuale=$2,
        istat_data_ultima_revisione=CURRENT_DATE,
        istat_data_prossima_revisione=(CURRENT_DATE + ($3 || ' months')::interval)::date
       WHERE id=$4 RETURNING *`,
      [nuovo, pct, String(mesi), req.params.id]);
    try {
      await pool.query(
        `INSERT INTO sub_storia (sub_id, tipo, titolo, descrizione, dati_vecchi, dati_nuovi, created_by)
         VALUES ($1,'adeguamento_istat',$2,$3,$4,$5,$6)`,
        [s.id, 'Adeguamento ISTAT +' + pct + '%',
         'Canone annuo da € ' + vecchio.toLocaleString('it-IT') + ' a € ' + nuovo.toLocaleString('it-IT'),
         JSON.stringify({ canone_annuo: vecchio }), JSON.stringify({ canone_annuo: nuovo, percentuale: pct }),
         req.user.id]);
    } catch(e2) { console.warn('[istat] storia non salvata:', e2.message); }
    res.json({ ok: true, sub: r.rows[0], canone_vecchio: vecchio, canone_nuovo: nuovo });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
