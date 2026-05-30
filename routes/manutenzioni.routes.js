'use strict';
const router = require('express').Router();
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { updateSaluteImmobile, generateTags, extractPriceFromText, parseDate, parsePrice, normalizeStr } = require('../utils/helpers');


router.get('/api/manutenzioni', authMiddleware, async (req, res) => {
  const { sub_id, sede_id, stato, priorita } = req.query;
  let where = ['1=1'], params = [], p = 1;
  if (sub_id) { where.push(`m.sub_id=$${p++}`); params.push(sub_id); }
  if (sede_id) { where.push(`m.sede_id=$${p++}`); params.push(sede_id); }
  if (stato) { where.push(`m.stato=$${p++}`); params.push(stato); }
  if (priorita) { where.push(`m.priorita=$${p++}`); params.push(priorita); }
  const r = await pool.query(`
    SELECT m.*, s.codice as sub_codice, sd.nome as sede_nome, f.ragione_sociale as fornitore_nome,
      u.nome as autore,
      (m.prossima_scadenza - CURRENT_DATE) as giorni_scadenza
    FROM manutenzioni m
    LEFT JOIN subs s ON m.sub_id=s.id
    LEFT JOIN sedi sd ON m.sede_id=sd.id
    LEFT JOIN fornitori f ON m.fornitore_id=f.id
    LEFT JOIN users u ON m.created_by=u.id
    WHERE ${where.join(' AND ')}
    ORDER BY m.prossima_scadenza ASC NULLS LAST, m.priorita DESC`, params);
  res.json(r.rows);
});

router.post('/api/manutenzioni', authMiddleware, async (req, res) => {
  const v = req.body;
  // Calcola prossima scadenza in base alla ricorrenza
  let prossima = v.data_programmata || null;
  if (v.data_eseguita && v.ricorrenza) {
    const base = new Date(v.data_eseguita);
    const map = { mensile: 1, bimestrale: 2, trimestrale: 3, semestrale: 6, annuale: 12, biennale: 24 };
    const mesi = map[v.ricorrenza] || 12;
    base.setMonth(base.getMonth() + mesi);
    prossima = base.toISOString().split('T')[0];
  }
  const r = await pool.query(`
    INSERT INTO manutenzioni (sub_id,sede_id,fornitore_id,tipo,descrizione,priorita,stato,
      data_programmata,data_eseguita,ricorrenza,prossima_scadenza,costo,note,created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [v.sub_id||null, v.sede_id||null, v.fornitore_id||null, v.tipo, v.descrizione||null,
     v.priorita||'normale', v.stato||'programmata', v.data_programmata||null, v.data_eseguita||null,
     v.ricorrenza||null, prossima, v.costo||null, v.note||null, req.user.id]);
  if (v.sub_id) await pool.query(
    'INSERT INTO sub_storia (sub_id,tipo,titolo,descrizione,created_by) VALUES ($1,$2,$3,$4,$5)',
    [v.sub_id, 'manutenzione', `Manutenzione: ${v.tipo}`, v.descrizione||'', req.user.id]);
  res.json(r.rows[0]);
});

router.put('/api/manutenzioni/:id', authMiddleware, async (req, res) => {
  const v = req.body;
  let prossima = v.prossima_scadenza || null;
  if (v.data_eseguita && v.ricorrenza) {
    const base = new Date(v.data_eseguita);
    const map = { mensile:1, bimestrale:2, trimestrale:3, semestrale:6, annuale:12, biennale:24 };
    base.setMonth(base.getMonth() + (map[v.ricorrenza]||12));
    prossima = base.toISOString().split('T')[0];
  }
  const r = await pool.query(`
    UPDATE manutenzioni SET sub_id=$1,sede_id=$2,fornitore_id=$3,tipo=$4,descrizione=$5,
      priorita=$6,stato=$7,data_programmata=$8,data_eseguita=$9,ricorrenza=$10,
      prossima_scadenza=$11,costo=$12,note=$13,updated_at=NOW()
    WHERE id=$14 RETURNING *`,
    [v.sub_id||null, v.sede_id||null, v.fornitore_id||null, v.tipo, v.descrizione||null,
     v.priorita||'normale', v.stato||'programmata', v.data_programmata||null, v.data_eseguita||null,
     v.ricorrenza||null, prossima, v.costo||null, v.note||null, req.params.id]);
  res.json(r.rows[0]);
});

router.delete('/api/manutenzioni/:id', authMiddleware, async (req, res) => {
  await pool.query('DELETE FROM manutenzioni WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

router.get('/api/manutenzioni/scadenze', authMiddleware, async (req, res) => {
  const r = await pool.query(`
    SELECT m.*, s.codice as sub_codice, sd.nome as sede_nome,
      (m.prossima_scadenza - CURRENT_DATE) as giorni_scadenza
    FROM manutenzioni m
    LEFT JOIN subs s ON m.sub_id=s.id
    LEFT JOIN sedi sd ON m.sede_id=sd.id
    WHERE m.prossima_scadenza IS NOT NULL AND m.stato != 'annullata'
      AND m.prossima_scadenza <= CURRENT_DATE + INTERVAL '90 days'
    ORDER BY m.prossima_scadenza ASC LIMIT 20`);
  res.json(r.rows);
});

module.exports = router;
