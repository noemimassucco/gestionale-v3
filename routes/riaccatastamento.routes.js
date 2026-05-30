'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

// ═══════════════════════════════════════════════════════════
// RIACCATASTAMENTI
// ═══════════════════════════════════════════════════════════

// Lista riaccatastamenti per un SUB
router.get('/api/riaccatastamenti/:sub_id', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT r.*, u.nome as operatore
       FROM riaccatastamenti r LEFT JOIN users u ON r.created_by=u.id
       WHERE r.sub_id=$1 ORDER BY r.data_operazione DESC, r.created_at DESC`,
      [req.params.sub_id]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Esegui riaccatastamento — aggiorna dati catastali + storicizza
router.post('/api/riaccatastamenti', authMiddleware, async (req, res) => {
  const {
    sub_id, foglio_prec, particella_prec, subalterno_prec,
    foglio_nuovo, particella_nuova, subalterno_nuovo,
    data_operazione, protocollo_catastale, motivazione, note,
  } = req.body;

  if (!sub_id) return res.status(400).json({ error: 'sub_id obbligatorio' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Leggi stato attuale del SUB
    const subR = await client.query('SELECT * FROM subs WHERE id=$1', [sub_id]);
    if (!subR.rows.length) throw new Error('SUB non trovato');
    const sub = subR.rows[0];

    // 2. Salva il riaccatastamento
    const riacc = await client.query(
      `INSERT INTO riaccatastamenti
        (sub_id,foglio_prec,particella_prec,subalterno_prec,
         foglio_nuovo,particella_nuova,subalterno_nuovo,
         data_operazione,protocollo_catastale,motivazione,note,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [sub_id,
       foglio_prec || sub.foglio, particella_prec || sub.particella, subalterno_prec || sub.subalterno,
       foglio_nuovo, particella_nuova, subalterno_nuovo,
       data_operazione || new Date().toISOString().split('T')[0],
       protocollo_catastale || null, motivazione || null, note || null,
       req.user.id]);

    // 3. Aggiorna i dati catastali del SUB
    await client.query(
      `UPDATE subs SET foglio=$1, particella=$2, subalterno=$3, updated_at=NOW() WHERE id=$4`,
      [foglio_nuovo, particella_nuova, subalterno_nuovo, sub_id]);

    // 4. Registra nella storia del SUB
    await client.query(
      `INSERT INTO sub_storia (sub_id, tipo, titolo, descrizione, dati_vecchi, dati_nuovi, created_by)
       VALUES ($1,'riaccatastamento','Riaccatastamento catastale',
               $2,
               $3::jsonb, $4::jsonb, $5)`,
      [sub_id,
       `Riaccatastamento: ${foglio_prec||sub.foglio}/${particella_prec||sub.particella}/${subalterno_prec||sub.subalterno} → ${foglio_nuovo}/${particella_nuova}/${subalterno_nuovo}`,
       JSON.stringify({ foglio: sub.foglio, particella: sub.particella, subalterno: sub.subalterno }),
       JSON.stringify({ foglio: foglio_nuovo, particella: particella_nuova, subalterno: subalterno_nuovo,
                        protocollo: protocollo_catastale, motivazione }),
       req.user.id]);

    await client.query('COMMIT');
    res.json({ ok: true, riaccatastamento: riacc.rows[0] });
  } catch(e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// Elimina un riaccatastamento (solo admin)
router.delete('/api/riaccatastamenti/:id', authMiddleware, async (req, res) => {
  await pool.query('DELETE FROM riaccatastamenti WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// Genealogia catastale completa di un SUB
router.get('/api/riaccatastamenti/:sub_id/genealogia', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT r.*, s.codice as sub_codice, u.nome as operatore
       FROM riaccatastamenti r
       JOIN subs s ON r.sub_id=s.id
       LEFT JOIN users u ON r.created_by=u.id
       WHERE r.sub_id=$1
       ORDER BY r.data_operazione ASC, r.created_at ASC`,
      [req.params.sub_id]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// MILLESIMI
// ═══════════════════════════════════════════════════════════

// Lista tabelle millesimali
router.get('/api/millesimi/tabelle', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM millesimi_tabelle ORDER BY nome');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Crea tabella millesimale
router.post('/api/millesimi/tabelle', authMiddleware, async (req, res) => {
  const { nome, descrizione } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome obbligatorio' });
  try {
    const r = await pool.query(
      'INSERT INTO millesimi_tabelle (nome,descrizione) VALUES ($1,$2) RETURNING *',
      [nome, descrizione || null]);
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Elimina tabella millesimale
router.delete('/api/millesimi/tabelle/:id', authMiddleware, async (req, res) => {
  await pool.query('DELETE FROM millesimi_tabelle WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// Millesimi di un SUB (tutti i valori per tutte le tabelle)
router.get('/api/millesimi/:sub_id', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT mv.*, mt.nome as tabella_nome, mt.descrizione as tabella_desc
       FROM millesimi_valori mv
       JOIN millesimi_tabelle mt ON mv.tabella_id=mt.id
       WHERE mv.sub_id=$1 ORDER BY mt.nome`,
      [req.params.sub_id]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Imposta valore millesimale per un SUB + tabella
router.put('/api/millesimi/:sub_id', authMiddleware, async (req, res) => {
  const { tabella_id, valore, note } = req.body;
  if (!tabella_id) return res.status(400).json({ error: 'tabella_id obbligatorio' });
  try {
    const r = await pool.query(
      `INSERT INTO millesimi_valori (sub_id, tabella_id, valore, note, updated_at)
       VALUES ($1,$2,$3,$4,NOW())
       ON CONFLICT (sub_id, tabella_id) DO UPDATE
         SET valore=$3, note=$4, updated_at=NOW()
       RETURNING *`,
      [req.params.sub_id, tabella_id, valore || 0, note || null]);
    // Also update the main millesimi field if it's the first/default table
    await pool.query('UPDATE subs SET millesimi=$1 WHERE id=$2', [valore, req.params.sub_id])
      .catch(() => {});
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Tutti i millesimi per tutti i SUB (per calcolo ripartizione)
router.get('/api/millesimi/tabelle/:tabella_id/valori', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT mv.*, s.codice as sub_codice, s.piano,
              sd.nome as sede, i.ragione_sociale as inquilino,
              (mv.valore * 100.0 / NULLIF(SUM(mv.valore) OVER(),0))::numeric(6,2) as percentuale
       FROM millesimi_valori mv
       JOIN subs s ON mv.sub_id=s.id
       LEFT JOIN sedi sd ON s.sede_id=sd.id
       LEFT JOIN inquilini i ON s.inquilino_id=i.id
       WHERE mv.tabella_id=$1
       ORDER BY mv.valore DESC`,
      [req.params.tabella_id]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Timeline completa di un SUB (storia + riaccatastamenti + interventi)
router.get('/api/subs/:id/timeline', authMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const [storia, riaccatt, interventi, documenti, manutenzioni] = await Promise.all([
      pool.query(
        `SELECT id, tipo, titolo, descrizione, dati_vecchi, dati_nuovi, created_at,
                'storia' as fonte
         FROM sub_storia WHERE sub_id=$1 ORDER BY created_at DESC`, [id]),
      pool.query(
        `SELECT id, 'riaccatastamento' as tipo,
                'Riaccatastamento catastale' as titolo,
                CONCAT(foglio_prec,'/',particella_prec,'/',subalterno_prec,' → ',
                       foglio_nuovo,'/',particella_nuova,'/',subalterno_nuovo) as descrizione,
                data_operazione as data, protocollo_catastale, motivazione,
                created_at, 'riaccatastamento' as fonte
         FROM riaccatastamenti WHERE sub_id=$1 ORDER BY data_operazione DESC`, [id]),
      pool.query(
        `SELECT i.id, 'intervento' as tipo, i.descrizione as titolo,
                CONCAT(f.ragione_sociale,' — €',COALESCE(i.prezzo::text,'—')) as descrizione,
                i.data_intervento as data, i.prezzo, i.num_fattura, i.created_at,
                'intervento' as fonte
         FROM interventi i LEFT JOIN fornitori f ON i.fornitore_id=f.id
         WHERE i.sub_id=$1 ORDER BY i.data_intervento DESC LIMIT 20`, [id]),
      pool.query(
        `SELECT id, 'documento' as tipo, nome as titolo,
                CONCAT(tipo,COALESCE(' — scad. '||scadenza::text,'')) as descrizione,
                data_documento as data, created_at, 'documento' as fonte
         FROM documenti WHERE sub_id=$1 ORDER BY created_at DESC LIMIT 10`, [id]),
      pool.query(
        `SELECT id, 'manutenzione' as tipo, tipo as titolo,
                CONCAT(stato,' — ',COALESCE(priorita,'')) as descrizione,
                data_programmata as data, created_at, 'manutenzione' as fonte
         FROM manutenzioni WHERE sub_id=$1 ORDER BY data_programmata DESC LIMIT 10`, [id]),
    ]);

    // Merge and sort by date
    const all = [
      ...storia.rows,
      ...riaccatt.rows,
      ...interventi.rows,
      ...documenti.rows,
      ...manutenzioni.rows,
    ].sort((a, b) => new Date(b.created_at || b.data || 0) - new Date(a.created_at || a.data || 0));

    res.json(all);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
