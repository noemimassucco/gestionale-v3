'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

// ═══════════════════════════════════════════════════════════
// CONTROLLO FATTURAZIONE — flusso unico di controllo dal caricamento della spesa
// (uscita) fino alla decisione di rifatturazione e all'esportazione per la contabilità.
// ═══════════════════════════════════════════════════════════

const SELECT_BASE = `
  SELECT c.*,
    s.codice as sub_codice, sd.nome as sede_nome,
    CASE
      WHEN c.attribuito_a_tipo='cliente' THEN i.ragione_sociale
      WHEN c.attribuito_a_tipo='sub' THEN sa.codice
      WHEN c.attribuito_a_tipo='condominio' THEN sda.nome
      ELSE c.attribuito_a_testo
    END as attribuito_a_nome,
    of.numero_fattura as fattura_numero, of.stato_pagamento as fattura_stato_pagamento
  FROM controllo_fatturazione c
  LEFT JOIN subs s ON c.sub_id=s.id
  LEFT JOIN sedi sd ON c.sede_id=sd.id
  LEFT JOIN inquilini i ON c.attribuito_a_tipo='cliente' AND c.attribuito_a_id=i.id
  LEFT JOIN subs sa ON c.attribuito_a_tipo='sub' AND c.attribuito_a_id=sa.id
  LEFT JOIN sedi sda ON c.attribuito_a_tipo='condominio' AND c.attribuito_a_id=sda.id
  LEFT JOIN ordini_fatturazione of ON c.fattura_id=of.id
`;

router.get('/api/controllo-fatturazione', authMiddleware, async (req, res) => {
  const { stato_decisione, rifatturabile, sede_id, sub_id, origine_tipo, search, anno } = req.query;
  let where = ['1=1'], params = [], p = 1;
  if (stato_decisione) { where.push(`c.stato_decisione=$${p++}`); params.push(stato_decisione); }
  if (rifatturabile)   { where.push(`c.rifatturabile=$${p++}`); params.push(rifatturabile); }
  if (sede_id)         { where.push(`c.sede_id=$${p++}`); params.push(sede_id); }
  if (sub_id)          { where.push(`c.sub_id=$${p++}`); params.push(sub_id); }
  if (origine_tipo)    { where.push(`c.origine_tipo=$${p++}`); params.push(origine_tipo); }
  if (anno)            { where.push(`EXTRACT(YEAR FROM c.data_documento)=$${p++}`); params.push(anno); }
  if (search)          { where.push(`(c.fornitore_nome ILIKE $${p} OR c.descrizione ILIKE $${p} OR c.protocollo ILIKE $${p})`); params.push(`%${search}%`); p++; }
  try {
    const r = await pool.query(`${SELECT_BASE} WHERE ${where.join(' AND ')} ORDER BY c.data_documento DESC NULLS LAST, c.id DESC`, params);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Riepilogo di controllo, non bloccante: cosa manca prima di esportare per la contabilità
router.get('/api/controllo-fatturazione/riepilogo', authMiddleware, async (req, res) => {
  try {
    const tot = await pool.query('SELECT COUNT(*) n FROM controllo_fatturazione');
    const daDecidere = await pool.query(`SELECT COUNT(*) n FROM controllo_fatturazione WHERE rifatturabile='da_decidere'`);
    const senzaAttribuzione = await pool.query(`SELECT COUNT(*) n FROM controllo_fatturazione WHERE rifatturabile='si' AND attribuito_a_tipo IS NULL`);
    const senzaProtocollo = await pool.query(`SELECT COUNT(*) n FROM controllo_fatturazione WHERE protocollo IS NULL OR protocollo=''`);
    const sospese = await pool.query(`SELECT COUNT(*) n FROM controllo_fatturazione WHERE stato_decisione='sospesa'`);
    const daFatturareVecchie = await pool.query(`SELECT COUNT(*) n FROM controllo_fatturazione WHERE stato_decisione='da_fatturare' AND data_documento < CURRENT_DATE - INTERVAL '90 days'`);
    // Possibili duplicati: stesso fornitore, stesso importo, stessa data — probabilmente la stessa spesa caricata due volte
    const duplicati = await pool.query(`
      SELECT fornitore_nome, importo, data_documento, COUNT(*) n, array_agg(id) ids
      FROM controllo_fatturazione
      WHERE fornitore_nome IS NOT NULL AND importo IS NOT NULL AND data_documento IS NOT NULL
      GROUP BY fornitore_nome, importo, data_documento
      HAVING COUNT(*) > 1`);
    const importiNonAttribuiti = await pool.query(`SELECT COALESCE(SUM(importo),0) tot FROM controllo_fatturazione WHERE rifatturabile='si' AND attribuito_a_tipo IS NULL`);
    res.json({
      totale_uscite: parseInt(tot.rows[0].n),
      da_decidere: parseInt(daDecidere.rows[0].n),
      senza_attribuzione: parseInt(senzaAttribuzione.rows[0].n),
      senza_protocollo: parseInt(senzaProtocollo.rows[0].n),
      sospese: parseInt(sospese.rows[0].n),
      da_fatturare_da_oltre_90gg: parseInt(daFatturareVecchie.rows[0].n),
      possibili_duplicati: duplicati.rows,
      importo_non_attribuito: parseFloat(importiNonAttribuiti.rows[0].tot),
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Export per la contabilità — i campi che decide/riporta lei; imponibile/IVA/stato fatturazione
// restano vuoti: li completa la contabile dopo (vedi reimport)
router.get('/api/controllo-fatturazione/export', authMiddleware, async (req, res) => {
  const { anno, sede_id, stato_decisione } = req.query;
  let where = ['1=1'], params = [], p = 1;
  if (anno) { where.push(`EXTRACT(YEAR FROM c.data_documento)=$${p++}`); params.push(anno); }
  if (sede_id) { where.push(`c.sede_id=$${p++}`); params.push(sede_id); }
  if (stato_decisione) { where.push(`c.stato_decisione=$${p++}`); params.push(stato_decisione); }
  try {
    const r = await pool.query(`${SELECT_BASE} WHERE ${where.join(' AND ')} ORDER BY c.data_documento DESC NULLS LAST, c.id DESC`, params);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/api/controllo-fatturazione/:id', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(`${SELECT_BASE} WHERE c.id=$1`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Non trovato' });
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Aggiorna SOLO i campi di decisione (mai i dati descrittivi, che restano allineati alla fonte)
router.put('/api/controllo-fatturazione/:id', authMiddleware, async (req, res) => {
  const v = req.body;
  try {
    const r = await pool.query(`
      UPDATE controllo_fatturazione SET
        rifatturabile=COALESCE($1,rifatturabile),
        modalita=$2,
        quota_rifatturabile=$3,
        attribuito_a_tipo=$4,
        attribuito_a_id=$5,
        attribuito_a_testo=$6,
        criterio_riparto=$7,
        millesimi_tabella_id=$8,
        stato_decisione=COALESCE($9,stato_decisione),
        fattura_id=$10,
        note=$11,
        updated_at=NOW()
      WHERE id=$12 RETURNING *`,
      [v.rifatturabile||null, v.modalita||null, v.quota_rifatturabile||null,
       v.attribuito_a_tipo||null, v.attribuito_a_id||null, v.attribuito_a_testo||null,
       v.criterio_riparto||null, v.millesimi_tabella_id||null, v.stato_decisione||null,
       v.fattura_id||null, v.note||null, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Non trovato' });
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Re-import: la contabile ricarica il file compilato con protocollo/stato fatturazione aggiornati
router.post('/api/controllo-fatturazione/reimport', authMiddleware, async (req, res) => {
  const { rows } = req.body;
  if (!rows?.length) return res.json({ updated: 0, errors: [] });
  let updated = 0, errors = [];
  for (const row of rows) {
    try {
      const id = row.id;
      if (!id) continue;
      const updates = {};
      if (row.protocollo) updates.protocollo = row.protocollo;
      if (row.stato_decisione) updates.stato_decisione = row.stato_decisione;
      if (row.note_contabili) updates.note = row.note_contabili;
      if (!Object.keys(updates).length) continue;
      const sets = Object.keys(updates).map((k,i)=>`${k}=$${i+2}`).join(',');
      await pool.query(`UPDATE controllo_fatturazione SET ${sets}, updated_at=NOW() WHERE id=$1`, [id, ...Object.values(updates)]);
      updated++;
    } catch(e) { errors.push({ row: row.id, error: e.message }); }
  }
  res.json({ updated, errors });
});

module.exports = router;
