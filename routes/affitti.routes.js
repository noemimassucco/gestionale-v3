'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

router.get('/api/pagamenti-affitto', authMiddleware, async (req, res) => {
  const { sub_id, anno } = req.query;
  let where = ['1=1'], params = [], p = 1;
  if (sub_id) { where.push(`p.sub_id=$${p++}`); params.push(sub_id); }
  if (anno) { where.push(`p.anno=$${p++}`); params.push(anno); }
  const r = await pool.query(`
    SELECT p.*,s.codice as sub_codice,sd.nome as sede_nome,i.ragione_sociale as inquilino_nome
    FROM pagamenti_affitto p LEFT JOIN subs s ON p.sub_id=s.id LEFT JOIN sedi sd ON s.sede_id=sd.id
    LEFT JOIN inquilini i ON p.inquilino_id=i.id
    WHERE ${where.join(' AND ')} ORDER BY p.anno DESC, p.mese DESC`, params);
  res.json(r.rows);
});

router.post('/api/pagamenti-affitto', authMiddleware, async (req, res) => {
  // ── Blocco sicurezza: SUB deve essere attivo ──────────────
  if (sub_id) {
    const subCheck = await pool.query('SELECT stato_sub FROM subs WHERE id=$1', [sub_id]);
    if (subCheck.rows.length && subCheck.rows[0].stato_sub && subCheck.rows[0].stato_sub !== 'attivo') {
      return res.status(400).json({ error: `SUB non attivo (stato: ${subCheck.rows[0].stato_sub}) — operazione non consentita` });
    }
  }
  const { sub_id, inquilino_id, anno, mese, importo, data_pagamento, stato, note } = req.body;
  if (!sub_id || !anno || !mese || !importo) return res.status(400).json({ error: 'Campi obbligatori mancanti' });
  const r = await pool.query(
    'INSERT INTO pagamenti_affitto (sub_id,inquilino_id,anno,mese,importo,data_pagamento,stato,note,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
    [sub_id, inquilino_id||null, anno, mese, importo, data_pagamento||null, stato||'pagato', note||null, req.user.id]
  );
  await pool.query('INSERT INTO sub_storia (sub_id,tipo,titolo,descrizione,created_by) VALUES ($1,$2,$3,$4,$5)',
    [sub_id, 'pagamento', `Affitto ${['','Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'][mese]} ${anno}`,
     `€ ${parseFloat(importo).toLocaleString('it-IT')} — Stato: ${stato||'pagato'}`, req.user.id]);
  res.json(r.rows[0]);
});

router.put('/api/pagamenti-affitto/:id', authMiddleware, async (req, res) => {
  const { importo, data_pagamento, stato, note } = req.body;
  const r = await pool.query(
    'UPDATE pagamenti_affitto SET importo=$1,data_pagamento=$2,stato=$3,note=$4 WHERE id=$5 RETURNING *',
    [importo, data_pagamento||null, stato||'pagato', note||null, req.params.id]
  );
  res.json(r.rows[0]);
});

router.delete('/api/pagamenti-affitto/:id', authMiddleware, async (req, res) => {
  await pool.query('DELETE FROM pagamenti_affitto WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

router.post('/api/pagamenti-affitto/genera-anno', authMiddleware, async (req, res) => {
  const { sub_id, anno, importo_mensile, inquilino_id } = req.body;
  if (!sub_id || !anno || !importo_mensile) return res.status(400).json({ error: 'Parametri mancanti' });
  let created = 0;
  for (let mese = 1; mese <= 12; mese++) {
    const exists = await pool.query('SELECT id FROM pagamenti_affitto WHERE sub_id=$1 AND anno=$2 AND mese=$3', [sub_id, anno, mese]);
    if (!exists.rows.length) {
      await pool.query('INSERT INTO pagamenti_affitto (sub_id,inquilino_id,anno,mese,importo,stato,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [sub_id, inquilino_id||null, anno, mese, importo_mensile, 'atteso', req.user.id]);
      created++;
    }
  }
  res.json({ created, message: `${created} mesi creati` });
});

router.get('/api/storico-inquilini/:sub_id', authMiddleware, async (req, res) => {
  const r = await pool.query(`
    SELECT si.*,i.ragione_sociale as inquilino_nome,i.tel,i.email,i.cf,i.piva
    FROM storico_inquilini si LEFT JOIN inquilini i ON si.inquilino_id=i.id
    WHERE si.sub_id=$1 ORDER BY si.data_inizio DESC NULLS LAST`, [req.params.sub_id]);
  res.json(r.rows);
});

router.post('/api/storico-inquilini', authMiddleware, async (req, res) => {
  const { sub_id, inquilino_id, data_inizio, data_fine, canone_mensile, tipo_contratto, note } = req.body;
  const r = await pool.query(
    'INSERT INTO storico_inquilini (sub_id,inquilino_id,data_inizio,data_fine,canone_mensile,tipo_contratto,note,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
    [sub_id, inquilino_id||null, data_inizio||null, data_fine||null, canone_mensile||null, tipo_contratto||null, note||null, req.user.id]
  );
  const inqNome = r.rows[0].inquilino_id ? (await pool.query('SELECT ragione_sociale FROM inquilini WHERE id=$1', [inquilino_id])).rows[0]?.ragione_sociale : 'Sconosciuto';
  await pool.query('INSERT INTO sub_storia (sub_id,tipo,titolo,descrizione,created_by) VALUES ($1,$2,$3,$4,$5)',
    [sub_id, 'cambio_inquilino', `Inquilino: ${inqNome}`, `${data_inizio?'Dal '+data_inizio:''} ${data_fine?'al '+data_fine:''} ${canone_mensile?'· € '+parseFloat(canone_mensile).toLocaleString('it-IT')+'/mese':''}`, req.user.id]);
  res.json(r.rows[0]);
});

router.delete('/api/storico-inquilini/:id', authMiddleware, async (req, res) => {
  await pool.query('DELETE FROM storico_inquilini WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

router.get('/api/redditivita', authMiddleware, async (req, res) => {
  const subs = await pool.query(`
    SELECT s.id, s.codice, s.stato_occupazione, s.canone_annuo, s.tipo_contratto,
      sd.nome as sede, i.ragione_sociale as inquilino,
      (SELECT COALESCE(SUM(prezzo),0) FROM interventi WHERE sub_id=s.id) as uscite_interventi,
      (SELECT COALESCE(SUM(costo),0) FROM manutenzioni WHERE sub_id=s.id) as uscite_manutenzioni,
      (SELECT COALESCE(SUM(importo),0) FROM pagamenti_affitto WHERE sub_id=s.id AND stato='pagato') as entrate_pagamenti,
      (SELECT COUNT(*) FROM pagamenti_affitto WHERE sub_id=s.id AND stato='insoluto') as mesi_insoluti
    FROM subs s LEFT JOIN sedi sd ON s.sede_id=sd.id LEFT JOIN inquilini i ON s.inquilino_id=i.id
    ORDER BY sd.nome, s.codice`);

  const result = subs.rows.map(s => {
    const uscite = parseFloat(s.uscite_interventi||0) + parseFloat(s.uscite_manutenzioni||0);
    const entrate = parseFloat(s.entrate_pagamenti||0);
    return { ...s, uscite_totali: uscite, entrate_totali: entrate, profitto_netto: entrate - uscite };
  });

  // Totali globali
  const totali = result.reduce((acc, s) => ({
    entrate: acc.entrate + s.entrate_totali,
    uscite: acc.uscite + s.uscite_totali,
    profitto: acc.profitto + s.profitto_netto,
  }), { entrate: 0, uscite: 0, profitto: 0 });

  res.json({ subs: result, totali });
});

module.exports = router;
