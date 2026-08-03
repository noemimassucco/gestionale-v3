'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const upload = require('../middleware/upload');

// ═══════════════════════════════════════════════════════════
// CONTRATTO E CANONE — il contratto di locazione (con l'inquilino) diventa il punto di
// partenza della fatturazione mensile del canone. Distinto dalla tabella "contratti", che
// resta invariata e serve per i contratti/documenti con i FORNITORI (manutenzione,
// assicurazione ecc.) — non va confusa né riusata.
//
// Le rate generate confluiscono nello Schema Fatturazione esistente (ordini_fatturazione,
// tipo_servizio='canone_locazione') invece di creare un sistema di fatturazione a parte.
// ═══════════════════════════════════════════════════════════

const cloudinary = require('cloudinary').v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const PERIODICITA_MESI = { mensile: 1, trimestrale: 3, semestrale: 6, annuale: 12 };
const MAX_RATE_GENERABILI = 60; // limite di sicurezza (5 anni di canoni mensili) contro loop involontari

// Calcola le rate previste da un contratto, SENZA scrivere nulla — usata sia dalla preview
// sia dalla generazione vera e propria, per garantire che calcolino sempre le stesse date.
function calcolaRate(contratto) {
  const step = PERIODICITA_MESI[contratto.periodicita] || 1;
  const rate = [];
  let cursore = new Date(contratto.data_inizio);
  // Contratto senza data fine: limita a un orizzonte di 12 MESI (non 12 rate — con
  // periodicità trimestrale/semestrale/annuale, 12 rate significherebbero rispettivamente
  // 3/6/12 anni di canoni generati in un colpo solo). L'utente potrà generare altre rate
  // più avanti, quando servirà, ripetendo l'azione.
  let fineOrizzonte;
  if (contratto.data_fine) {
    fineOrizzonte = new Date(contratto.data_fine);
  } else {
    fineOrizzonte = new Date(contratto.data_inizio);
    fineOrizzonte.setMonth(fineOrizzonte.getMonth() + 12);
    fineOrizzonte.setDate(fineOrizzonte.getDate() - 1);
  }

  for (let i = 0; i < MAX_RATE_GENERABILI; i++) {
    if (cursore > fineOrizzonte) break;
    const periodoDal = new Date(cursore);
    const periodoAl = new Date(cursore);
    periodoAl.setMonth(periodoAl.getMonth() + step);
    periodoAl.setDate(periodoAl.getDate() - 1);
    if (periodoAl > fineOrizzonte) periodoAl.setTime(fineOrizzonte.getTime());
    rate.push({
      periodo_dal: periodoDal.toISOString().split('T')[0],
      periodo_al: periodoAl.toISOString().split('T')[0],
      mese_riferimento: periodoDal.getMonth() + 1,
      anno_riferimento: periodoDal.getFullYear(),
      importo: parseFloat(contratto.canone),
    });
    cursore.setMonth(cursore.getMonth() + step);
  }
  return rate;
}

router.get('/api/contratti-affitto/:id', authMiddleware, async (req, res) => {
  const r = await pool.query(
    `SELECT ca.*,i.ragione_sociale as inquilino_nome FROM contratti_affitto ca
     LEFT JOIN inquilini i ON ca.inquilino_id=i.id WHERE ca.id=$1`, [req.params.id]);
  if (!r.rows.length) return res.status(404).json({ error: 'Contratto non trovato' });
  res.json(r.rows[0]);
});

router.post('/api/contratti-affitto', authMiddleware, async (req, res) => {
  const v = req.body;
  if (!v.sub_id || !v.data_inizio || !v.canone) {
    return res.status(400).json({ error: 'SUB, data inizio e canone sono obbligatori' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Chiude l'eventuale contratto già attivo su questo SUB (stesso principio già usato da
    // "cambia inquilino": il vecchio contratto viene chiuso automaticamente, mai cancellato).
    await client.query(
      `UPDATE contratti_affitto SET stato='chiuso', data_fine=COALESCE(data_fine,$2) WHERE sub_id=$1 AND stato='attivo'`,
      [v.sub_id, v.data_inizio]
    );
    const r = await client.query(
      `INSERT INTO contratti_affitto
        (sub_id,inquilino_id,tipo_contratto,data_inizio,data_fine,canone,periodicita,giorno_fatturazione,
         istat_percentuale,istat_periodicita,istat_tipo,note,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [v.sub_id, v.inquilino_id||null, v.tipo_contratto||null, v.data_inizio, v.data_fine||null,
       v.canone, v.periodicita||'mensile', v.giorno_fatturazione||null,
       v.istat_percentuale||null, v.istat_periodicita||'12_mesi', v.istat_tipo||'automatico',
       v.note||null, req.user.id]
    );
    // Allinea i campi "sintetici" già letti da tutto il resto del gestionale (dashboard,
    // elenco SUB, riepilogo) — non li sposto, restano la fonte per chi legge solo subs.
    await client.query(
      `UPDATE subs SET inquilino_id=$1, stato_occupazione=$2, tipo_contratto=$3,
        data_inizio_contratto=$4, canone_annuo=$5 WHERE id=$6`,
      [v.inquilino_id||null, v.inquilino_id ? 'occupato' : 'libero', v.tipo_contratto||null,
       v.data_inizio, v.canone ? parseFloat(v.canone) * (12 / (PERIODICITA_MESI[v.periodicita]||1)) : null,
       v.sub_id]
    );
    await client.query(
      `INSERT INTO sub_storia (sub_id,tipo,titolo,descrizione,created_by) VALUES ($1,$2,$3,$4,$5)`,
      [v.sub_id, 'contratto', 'Nuovo contratto di locazione',
       `Canone € ${parseFloat(v.canone).toLocaleString('it-IT')} — ${v.periodicita||'mensile'}`, req.user.id]
    );
    await client.query('COMMIT');
    res.json(r.rows[0]);
  } catch(e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

router.put('/api/contratti-affitto/:id', authMiddleware, async (req, res) => {
  // Modifica i termini del contratto. NON tocca le rate già generate: se cambia il canone o
  // le date, le rate non ancora fatturate/esportate vanno rigenerate esplicitamente con
  // POST /genera-rate (che mostra prima un riepilogo), quelle già esportate/fatturate restano intatte.
  const v = req.body;
  const r = await pool.query(
    `UPDATE contratti_affitto SET
      inquilino_id=$1, tipo_contratto=$2, data_inizio=$3, data_fine=$4, canone=$5,
      periodicita=$6, giorno_fatturazione=$7, istat_percentuale=$8, istat_periodicita=$9,
      istat_tipo=$10, note=$11, updated_at=NOW()
     WHERE id=$12 RETURNING *`,
    [v.inquilino_id||null, v.tipo_contratto||null, v.data_inizio, v.data_fine||null, v.canone,
     v.periodicita||'mensile', v.giorno_fatturazione||null, v.istat_percentuale||null,
     v.istat_periodicita||'12_mesi', v.istat_tipo||'automatico', v.note||null, req.params.id]
  );
  if (!r.rows.length) return res.status(404).json({ error: 'Contratto non trovato' });
  res.json(r.rows[0]);
});

router.post('/api/contratti-affitto/:id/chiudi', authMiddleware, async (req, res) => {
  const { data_fine } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `UPDATE contratti_affitto SET stato='chiuso', data_fine=COALESCE($1,data_fine,CURRENT_DATE), updated_at=NOW()
       WHERE id=$2 RETURNING *`,
      [data_fine||null, req.params.id]
    );
    if (!r.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Contratto non trovato' }); }
    // Le rate non ancora fatturate/esportate diventano "sospese" (non cancellate: il contratto
    // è chiuso, quelle rate non hanno più motivo di essere fatturate così come previste).
    await client.query(
      `UPDATE ordini_fatturazione SET stato='sospeso', updated_at=NOW()
       WHERE contratto_affitto_id=$1 AND stato='da_fatturare'`,
      [req.params.id]
    );
    await client.query('COMMIT');
    res.json(r.rows[0]);
  } catch(e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

router.post('/api/contratti-affitto/:id/documento', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nessun file caricato' });
  let url = null, cloudinary_id = null, salvaInDb = false;
  if (process.env.CLOUDINARY_CLOUD_NAME) {
    try {
      const b64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
      const result = await cloudinary.uploader.upload(b64, { folder: 'gestionale-contratti-affitto', resource_type: 'auto' });
      url = result.secure_url; cloudinary_id = result.public_id;
    } catch(cldErr) {
      console.error('⚠️ Cloudinary fallito (contratto affitto), salvo nel DB:', cldErr.message);
      salvaInDb = true;
    }
  } else {
    salvaInDb = true;
  }
  const r = await pool.query(
    `UPDATE contratti_affitto SET documento_url=$1, documento_cloudinary_id=$2, updated_at=NOW() WHERE id=$3 RETURNING *`,
    [url, cloudinary_id, req.params.id]
  );
  if (!r.rows.length) return res.status(404).json({ error: 'Contratto non trovato' });
  if (salvaInDb) {
    await pool.query(
      `INSERT INTO contratti_affitto_files (contratto_affitto_id,mime,size,data) VALUES ($1,$2,$3,$4)
       ON CONFLICT (contratto_affitto_id) DO UPDATE SET mime=$2,size=$3,data=$4`,
      [req.params.id, req.file.mimetype, req.file.size, req.file.buffer]);
    const fUrl = '/api/contratti-affitto/' + req.params.id + '/documento/file';
    await pool.query('UPDATE contratti_affitto SET documento_url=$1 WHERE id=$2', [fUrl, req.params.id]);
    r.rows[0].documento_url = fUrl;
  }
  res.json(r.rows[0]);
});

router.get('/api/contratti-affitto/:id/documento/file', async (req, res) => {
  try {
    const jwt = require('jsonwebtoken');
    const { JWT_SECRET } = require('../middleware/auth');
    const tok = (req.headers.authorization||'').replace('Bearer ','') || req.query.token || '';
    try { jwt.verify(tok, JWT_SECRET); } catch { return res.status(401).json({ error: 'Non autorizzato' }); }
    const r = await pool.query('SELECT mime,data FROM contratti_affitto_files WHERE contratto_affitto_id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'File non trovato' });
    res.setHeader('Content-Type', r.rows[0].mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline; filename="contratto"');
    res.send(r.rows[0].data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/api/contratti-affitto/:id/genera-rate/preview', authMiddleware, async (req, res) => {
  const cr = await pool.query('SELECT * FROM contratti_affitto WHERE id=$1', [req.params.id]);
  if (!cr.rows.length) return res.status(404).json({ error: 'Contratto non trovato' });
  const contratto = cr.rows[0];
  const rate = calcolaRate(contratto);
  // Segna quali esistono già (per non dare l'impressione di generarne di nuove se sono già lì)
  const esistenti = await pool.query(
    `SELECT periodo_dal, stato FROM ordini_fatturazione WHERE contratto_affitto_id=$1`, [req.params.id]);
  const mappaEsistenti = {};
  esistenti.rows.forEach(r => { mappaEsistenti[new Date(r.periodo_dal).toISOString().split('T')[0]] = r.stato; });
  const preview = rate.map(r => ({ ...r, stato_esistente: mappaEsistenti[r.periodo_dal] || null }));
  const nuove = preview.filter(r => !r.stato_esistente).length;
  res.json({ rate: preview, totale: preview.length, nuove, gia_presenti: preview.length - nuove });
});

router.post('/api/contratti-affitto/:id/genera-rate', authMiddleware, async (req, res) => {
  const cr = await pool.query('SELECT * FROM contratti_affitto WHERE id=$1', [req.params.id]);
  if (!cr.rows.length) return res.status(404).json({ error: 'Contratto non trovato' });
  const contratto = cr.rows[0];
  const rate = calcolaRate(contratto);
  let create = 0, saltate = 0;
  for (const rata of rate) {
    // Anti-duplicati: mai una seconda rata per lo stesso contratto+periodo, e mai toccare
    // (né ricreare sopra) una rata che esiste già, qualunque sia il suo stato.
    const exists = await pool.query(
      `SELECT id FROM ordini_fatturazione WHERE contratto_affitto_id=$1 AND periodo_dal=$2`,
      [req.params.id, rata.periodo_dal]);
    if (exists.rows.length) { saltate++; continue; }
    await pool.query(
      `INSERT INTO ordini_fatturazione
        (sub_id,inquilino_id,tipo_servizio,nome_servizio,importo,periodicita,
         periodo_dal,periodo_al,mese_riferimento,anno_riferimento,stato,contratto_affitto_id,created_by)
       VALUES ($1,$2,'canone_locazione','Canone di locazione',$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [contratto.sub_id, contratto.inquilino_id||null, rata.importo, contratto.periodicita,
       rata.periodo_dal, rata.periodo_al, rata.mese_riferimento, rata.anno_riferimento,
       contratto.stato === 'attivo' ? 'da_fatturare' : 'sospeso', req.params.id, req.user.id]);
    create++;
  }
  res.json({ create, saltate, totale: rate.length });
});

module.exports = router;
