const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const XLSX = require('xlsx');
const { Pool } = require('pg');
const cloudinary = require('cloudinary').v2;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'gestionale-v3-secret-2024';

// ── CLOUDINARY ────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── DB ────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Evita che un errore del pool DB faccia crashare l'intero server
pool.on('error', (err) => {
  console.error('⚠️ Errore pool DB (gestito):', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ Unhandled rejection (gestito):', reason?.message || reason);
});

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });


// ── AUTH MIDDLEWARE ───────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Non autenticato' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Token non valido' }); }
}

// ── INIT DB ───────────────────────────────────────────────────
async function initDB() {
  const client = await pool.connect();
  try {
    // Step 1: Crea tabelle
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, email VARCHAR(200) UNIQUE NOT NULL, password_hash VARCHAR(200) NOT NULL, nome VARCHAR(100), ruolo VARCHAR(50) DEFAULT 'operatore', attivo BOOLEAN DEFAULT true, ultimo_accesso TIMESTAMP, created_at TIMESTAMP DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS sedi (id SERIAL PRIMARY KEY, nome VARCHAR(100) NOT NULL, indirizzo TEXT, citta VARCHAR(100), note TEXT, created_at TIMESTAMP DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS inquilini (id SERIAL PRIMARY KEY, codice_zuc VARCHAR(50), ragione_sociale VARCHAR(200) NOT NULL, piva VARCHAR(20), cf VARCHAR(20), indirizzo TEXT, cap VARCHAR(10), citta VARCHAR(100), provincia VARCHAR(5), tel VARCHAR(50), email VARCHAR(100), created_at TIMESTAMP DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS fornitori (id SERIAL PRIMARY KEY, codice_zuc VARCHAR(50), ragione_sociale VARCHAR(200) NOT NULL, piva VARCHAR(20), cf VARCHAR(20), indirizzo TEXT, cap VARCHAR(10), citta VARCHAR(100), provincia VARCHAR(5), tel VARCHAR(50), email VARCHAR(100), spec VARCHAR(200), created_at TIMESTAMP DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS subs (id SERIAL PRIMARY KEY, codice VARCHAR(50) NOT NULL, ex_sub VARCHAR(50), sede_id INTEGER REFERENCES sedi(id), piano VARCHAR(100), inquilino_id INTEGER, stato_salute VARCHAR(10) DEFAULT 'verde', note TEXT, created_at TIMESTAMP DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS categorie (id SERIAL PRIMARY KEY, nome VARCHAR(100) NOT NULL, colore VARCHAR(20) DEFAULT '#2563eb', icona VARCHAR(50) DEFAULT '🔧');
      CREATE TABLE IF NOT EXISTS interventi (id SERIAL PRIMARY KEY, sub_id INTEGER REFERENCES subs(id), sede_id INTEGER REFERENCES sedi(id), fornitore_id INTEGER REFERENCES fornitori(id), inquilino_id INTEGER, categoria_id INTEGER REFERENCES categorie(id), protocollo VARCHAR(100), num_fattura VARCHAR(100), data_intervento DATE, data_fattura DATE, anno_fattura INTEGER, prezzo DECIMAL(12,2), descrizione TEXT, note TEXT, tags TEXT[], ha_notifica BOOLEAN DEFAULT false, created_by INTEGER REFERENCES users(id), updated_by INTEGER REFERENCES users(id), created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS allegati (id SERIAL PRIMARY KEY, intervento_id INTEGER REFERENCES interventi(id) ON DELETE CASCADE, tipo VARCHAR(50), nome VARCHAR(200), url TEXT, cloudinary_id VARCHAR(200), dimensione INTEGER, created_by INTEGER REFERENCES users(id), created_at TIMESTAMP DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS contratti (id SERIAL PRIMARY KEY, sub_id INTEGER REFERENCES subs(id), fornitore_id INTEGER REFERENCES fornitori(id), tipo VARCHAR(100), nome VARCHAR(200), url TEXT, cloudinary_id VARCHAR(200), data_inizio DATE, data_scadenza DATE, note TEXT, created_at TIMESTAMP DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS sub_storia (id SERIAL PRIMARY KEY, sub_id INTEGER REFERENCES subs(id) ON DELETE CASCADE, tipo VARCHAR(100) NOT NULL, titolo VARCHAR(300), descrizione TEXT, dati_vecchi JSONB, dati_nuovi JSONB, created_by INTEGER REFERENCES users(id), created_at TIMESTAMP DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS documenti (id SERIAL PRIMARY KEY, sub_id INTEGER REFERENCES subs(id), sede_id INTEGER REFERENCES sedi(id), fornitore_id INTEGER REFERENCES fornitori(id), tipo VARCHAR(80) DEFAULT 'documento', nome VARCHAR(300), url TEXT, cloudinary_id VARCHAR(300), data_documento DATE, scadenza DATE, importo DECIMAL(12,2), descrizione TEXT, note TEXT, tags TEXT[], created_by INTEGER REFERENCES users(id), created_at TIMESTAMP DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS settings (cfg_key VARCHAR(100) PRIMARY KEY, value TEXT, updated_by INTEGER, updated_at TIMESTAMP DEFAULT NOW());
    `);

    // Step 2: Migrazione colonna key -> cfg_key se esiste ancora
    try {
      const col = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name='settings' AND column_name='key'`);
      if (col.rows.length) await client.query(`ALTER TABLE settings RENAME COLUMN "key" TO cfg_key`);
    } catch(e) {}

    // Step 2b: Nuove colonne SUB (catastali, mq, ecc.)
    const newSubCols = [
      ['foglio', 'VARCHAR(50)'],
      ['particella', 'VARCHAR(50)'],
      ['subalterno', 'VARCHAR(50)'],
      ['categoria_cat', 'VARCHAR(50)'],
      ['mq_commerciali', 'DECIMAL(10,2)'],
      ['mq_calpestabili', 'DECIMAL(10,2)'],
      ['rendita', 'DECIMAL(12,2)'],
      ['stato_occupazione', 'VARCHAR(50)'],
      ['classe_energetica', 'VARCHAR(20)'],
      ['anno_costruzione', 'INTEGER'],
      ['note_catastali', 'TEXT'],
      ['indirizzo_completo', 'TEXT'],
      ['data_inizio_contratto', 'DATE'],
      ['canone_annuo', 'DECIMAL(12,2)'],
      ['tipo_contratto', 'VARCHAR(50)'],
      ['durata_contratto_anni', 'INTEGER'],
    ];
    for (const [col, type] of newSubCols) {
      try { await client.query(`ALTER TABLE subs ADD COLUMN IF NOT EXISTS ${col} ${type}`); } catch(e) {}
    }

    // Step 2c: Nuove tabelle operative
    await client.query(`
      CREATE TABLE IF NOT EXISTS manutenzioni (
        id SERIAL PRIMARY KEY, sub_id INTEGER REFERENCES subs(id), sede_id INTEGER REFERENCES sedi(id),
        fornitore_id INTEGER REFERENCES fornitori(id), tipo VARCHAR(100) NOT NULL, descrizione TEXT,
        priorita VARCHAR(20) DEFAULT 'normale', stato VARCHAR(30) DEFAULT 'programmata',
        data_programmata DATE, data_eseguita DATE, ricorrenza VARCHAR(50),
        prossima_scadenza DATE, costo DECIMAL(12,2), note TEXT,
        created_by INTEGER REFERENCES users(id), created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS pagamenti_affitto (
        id SERIAL PRIMARY KEY, sub_id INTEGER REFERENCES subs(id) ON DELETE CASCADE,
        inquilino_id INTEGER REFERENCES inquilini(id), anno INTEGER NOT NULL, mese INTEGER NOT NULL,
        importo DECIMAL(12,2) NOT NULL, data_pagamento DATE, stato VARCHAR(30) DEFAULT 'pagato',
        note TEXT, created_by INTEGER REFERENCES users(id), created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS storico_inquilini (
        id SERIAL PRIMARY KEY, sub_id INTEGER REFERENCES subs(id) ON DELETE CASCADE,
        inquilino_id INTEGER REFERENCES inquilini(id), data_inizio DATE, data_fine DATE,
        canone_mensile DECIMAL(12,2), tipo_contratto VARCHAR(100), note TEXT,
        created_by INTEGER REFERENCES users(id), created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS bollette (
        id SERIAL PRIMARY KEY, sub_id INTEGER REFERENCES subs(id),
        tipo VARCHAR(50) NOT NULL DEFAULT 'altro',
        fornitore_nome VARCHAR(200), numero VARCHAR(100),
        importo DECIMAL(12,2), periodo_dal DATE, periodo_al DATE,
        scadenza DATE, data_pagamento DATE, stato VARCHAR(30) DEFAULT 'da_pagare',
        url TEXT, cloudinary_id VARCHAR(300), note TEXT,
        created_by INTEGER REFERENCES users(id), created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS ticket (
        id SERIAL PRIMARY KEY, sub_id INTEGER REFERENCES subs(id),
        inquilino_id INTEGER REFERENCES inquilini(id),
        titolo VARCHAR(300) NOT NULL, descrizione TEXT,
        categoria VARCHAR(100), priorita VARCHAR(20) DEFAULT 'normale',
        stato VARCHAR(30) DEFAULT 'aperto',
        assegnato_a INTEGER REFERENCES users(id),
        data_chiusura TIMESTAMP,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS sub_relazioni (
        id SERIAL PRIMARY KEY,
        sub_padre INTEGER REFERENCES subs(id) ON DELETE CASCADE,
        sub_figlio INTEGER REFERENCES subs(id) ON DELETE CASCADE,
        tipo VARCHAR(50) NOT NULL,
        data DATE, note TEXT,
        created_by INTEGER REFERENCES users(id), created_at TIMESTAMP DEFAULT NOW()
      );
    `);


    // Step 3: Dati di default
    await client.query(`
      INSERT INTO settings (cfg_key, value) VALUES ('app_name','Gestionale Immobili'),('logo_url',''),('colore_primario','#2563eb'),('footer_text','Gestionale Immobili — Storico Interventi') ON CONFLICT (cfg_key) DO NOTHING;
      INSERT INTO categorie (nome,colore,icona) VALUES ('Elettrico','#f59e0b','⚡'),('Idraulico','#3b82f6','🔧'),('Climatizzazione','#06b6d4','❄️'),('Edile','#8b5cf6','🏗️'),('Sicurezza','#ef4444','🔒'),('Ascensori','#6b7280','🛗'),('Pulizie','#10b981','🧹'),('Manutenzione','#f97316','🔨'),('Altro','#94a3b8','📋') ON CONFLICT DO NOTHING;
      INSERT INTO sedi (nome,citta) VALUES ('Orbassano','Orbassano'),('Rivoli','Rivoli') ON CONFLICT DO NOTHING;
    `);

    // Step 4: Admin default
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@gestionale.it';
    const adminPwd = process.env.ADMIN_PASSWORD || 'Admin2024!';
    const existing = await client.query('SELECT id FROM users WHERE email=$1', [adminEmail]);
    if (!existing.rows.length) {
      const hash = await bcrypt.hash(adminPwd, 10);
      await client.query("INSERT INTO users (email,password_hash,nome,ruolo) VALUES ($1,$2,'Amministratore','admin')", [adminEmail, hash]);
    }
    // Step 5: Indici DB per performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_interventi_sub ON interventi(sub_id);
      CREATE INDEX IF NOT EXISTS idx_interventi_sede ON interventi(sede_id);
      CREATE INDEX IF NOT EXISTS idx_interventi_fornitore ON interventi(fornitore_id);
      CREATE INDEX IF NOT EXISTS idx_interventi_anno ON interventi(anno_fattura);
      CREATE INDEX IF NOT EXISTS idx_interventi_created ON interventi(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_interventi_notifica ON interventi(ha_notifica) WHERE ha_notifica=true;
      CREATE INDEX IF NOT EXISTS idx_subs_sede ON subs(sede_id);
      CREATE INDEX IF NOT EXISTS idx_subs_codice ON subs(codice);
      CREATE INDEX IF NOT EXISTS idx_documenti_sub ON documenti(sub_id);
      CREATE INDEX IF NOT EXISTS idx_documenti_scadenza ON documenti(scadenza) WHERE scadenza IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_manutenzioni_sub ON manutenzioni(sub_id);
      CREATE INDEX IF NOT EXISTS idx_manutenzioni_scadenza ON manutenzioni(prossima_scadenza) WHERE prossima_scadenza IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_pagamenti_sub ON pagamenti_affitto(sub_id);
      CREATE INDEX IF NOT EXISTS idx_pagamenti_anno ON pagamenti_affitto(anno,mese);
      CREATE INDEX IF NOT EXISTS idx_bollette_sub ON bollette(sub_id);
      CREATE INDEX IF NOT EXISTS idx_ticket_sub ON ticket(sub_id);
      CREATE INDEX IF NOT EXISTS idx_sub_storia_sub ON sub_storia(sub_id);
    `).catch(()=>{}); // ignore if already exist
  } finally { client.release(); }
}


app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const r = await pool.query('SELECT * FROM users WHERE email=$1 AND attivo=true', [email]);
    if (!r.rows.length) return res.status(401).json({ error: 'Email o password errati' });
    const user = r.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Email o password errati' });
    await pool.query('UPDATE users SET ultimo_accesso=NOW() WHERE id=$1', [user.id]);
    const token = jwt.sign({ id: user.id, email: user.email, nome: user.nome, ruolo: user.ruolo }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email, nome: user.nome, ruolo: user.ruolo } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  const r = await pool.query('SELECT id,email,nome,ruolo,ultimo_accesso FROM users WHERE id=$1', [req.user.id]);
  res.json(r.rows[0]);
});

app.post('/api/auth/change-password', authMiddleware, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const r = await pool.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
  if (!r.rows.length || !(await bcrypt.compare(oldPassword, r.rows[0].password_hash)))
    return res.status(401).json({ error: 'Password attuale errata' });
  const hash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, req.user.id]);
  res.json({ ok: true });
});

// Users management (admin only)
app.get('/api/users', authMiddleware, async (req, res) => {
  const r = await pool.query('SELECT id,email,nome,ruolo,attivo,ultimo_accesso,created_at FROM users ORDER BY nome');
  res.json(r.rows);
});
app.post('/api/users', authMiddleware, async (req, res) => {
  const { email, password, nome, ruolo } = req.body;
  const hash = await bcrypt.hash(password, 10);
  const r = await pool.query(
    'INSERT INTO users (email,password_hash,nome,ruolo) VALUES ($1,$2,$3,$4) RETURNING id,email,nome,ruolo',
    [email, hash, nome, ruolo || 'operatore']
  );
  res.json(r.rows[0]);
});
app.put('/api/users/:id', authMiddleware, async (req, res) => {
  const { nome, ruolo, attivo } = req.body;
  const r = await pool.query('UPDATE users SET nome=$1,ruolo=$2,attivo=$3 WHERE id=$4 RETURNING *', [nome, ruolo, attivo, req.params.id]);
  res.json(r.rows[0]);
});

// ═══════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════
app.post('/api/bulk-delete', authMiddleware, async (req, res) => {
  const {table,ids}=req.body;
  const allowed={interventi:1,documenti:1,manutenzioni:1,subs:1,fornitori:1,inquilini:1,bollette:1,ticket:1,pagamenti_affitto:1};
  if(!allowed[table]||!ids?.length) return res.status(400).json({error:'Parametri non validi'});
  await pool.query(`DELETE FROM ${table} WHERE id=ANY($1)`,[ids]);
  res.json({deleted:ids.length});
});

app.get('/api/settings', authMiddleware, async (req, res) => {
  const r = await pool.query('SELECT cfg_key,value FROM settings');
  const obj = {};
  r.rows.forEach(row => obj[row.cfg_key] = row.value);
  res.json(obj);
});
app.post('/api/settings', authMiddleware, async (req, res) => {
  const { settings } = req.body;
  for (const [key, value] of Object.entries(settings)) {
    await pool.query(
      'INSERT INTO settings (cfg_key,value,updated_by,updated_at) VALUES ($1,$2,$3,NOW()) ON CONFLICT(cfg_key) DO UPDATE SET value=$2,updated_by=$3,updated_at=NOW()',
      [key, value, req.user.id]
    );
  }
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// SEDI
// ═══════════════════════════════════════════════════════════
app.get('/api/sedi', authMiddleware, async (req, res) => {
  const r = await pool.query('SELECT * FROM sedi ORDER BY nome');
  res.json(r.rows);
});
app.post('/api/sedi', authMiddleware, async (req, res) => {
  const { nome, indirizzo, citta, note } = req.body;
  const r = await pool.query('INSERT INTO sedi (nome,indirizzo,citta,note) VALUES ($1,$2,$3,$4) RETURNING *', [nome, indirizzo||null, citta||null, note||null]);
  res.json(r.rows[0]);
});
app.put('/api/sedi/:id', authMiddleware, async (req, res) => {
  const { nome, indirizzo, citta, note } = req.body;
  const r = await pool.query('UPDATE sedi SET nome=$1,indirizzo=$2,citta=$3,note=$4 WHERE id=$5 RETURNING *', [nome, indirizzo||null, citta||null, note||null, req.params.id]);
  res.json(r.rows[0]);
});
app.delete('/api/sedi/:id', authMiddleware, async (req, res) => {
  await pool.query('DELETE FROM sedi WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// SUBS
// ═══════════════════════════════════════════════════════════
app.get('/api/subs/:id/detail', authMiddleware, async (req, res) => {
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


app.get('/api/subs/:id/storia', authMiddleware, async (req, res) => {
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

app.post('/api/subs/:id/storia', authMiddleware, async (req, res) => {
  const { tipo, titolo, descrizione } = req.body;
  const r = await pool.query(
    'INSERT INTO sub_storia (sub_id,tipo,titolo,descrizione,created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [req.params.id, tipo||'nota', titolo||'Nota', descrizione||'', req.user.id]
  );
  res.json(r.rows[0]);
});

// ═══════════════════════════════════════════════════════════
// DOCUMENTI
// ═══════════════════════════════════════════════════════════
app.get('/api/documenti', authMiddleware, async (req, res) => {
  const { sub_id, sede_id, tipo, search } = req.query;
  let where = ['1=1'], params = [], p = 1;
  if (sub_id) { where.push(`d.sub_id=$${p++}`); params.push(sub_id); }
  if (sede_id) { where.push(`d.sede_id=$${p++}`); params.push(sede_id); }
  if (tipo) { where.push(`d.tipo=$${p++}`); params.push(tipo); }
  if (search) { where.push(`(d.nome ILIKE $${p} OR d.descrizione ILIKE $${p})`); params.push(`%${search}%`); p++; }
  const r = await pool.query(`
    SELECT d.*,s.codice as sub_codice,sd.nome as sede_nome,f.ragione_sociale as fornitore_nome,u.nome as autore
    FROM documenti d
    LEFT JOIN subs s ON d.sub_id=s.id LEFT JOIN sedi sd ON d.sede_id=sd.id
    LEFT JOIN fornitori f ON d.fornitore_id=f.id LEFT JOIN users u ON d.created_by=u.id
    WHERE ${where.join(' AND ')} ORDER BY d.created_at DESC`, params);
  res.json(r.rows);
});

app.post('/api/documenti', authMiddleware, upload.single('file'), async (req, res) => {
  const { sub_id, sede_id, fornitore_id, tipo, nome, data_documento, scadenza, importo, descrizione, note } = req.body;
  let url = null, cloudinary_id = null;
  if (req.file) {
    if (process.env.CLOUDINARY_CLOUD_NAME) {
      const b64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
      const result = await cloudinary.uploader.upload(b64, { folder: 'gestionale-documenti', resource_type: 'auto' });
      url = result.secure_url; cloudinary_id = result.public_id;
    } else {
      url = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }
  }
  const nomeFile = nome || req.file?.originalname || 'Documento';
  const tags = [];
  if (tipo === 'fattura') tags.push('fattura');
  if (tipo === 'contratto') tags.push('contratto');
  if (scadenza) tags.push('con-scadenza');
  const r = await pool.query(
    'INSERT INTO documenti (sub_id,sede_id,fornitore_id,tipo,nome,url,cloudinary_id,data_documento,scadenza,importo,descrizione,note,tags,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *',
    [sub_id||null,sede_id||null,fornitore_id||null,tipo||'documento',nomeFile,url,cloudinary_id,data_documento||null,scadenza||null,importo||null,descrizione||null,note||null,tags,req.user.id]
  );
  if (sub_id) {
    await pool.query('INSERT INTO sub_storia (sub_id,tipo,titolo,descrizione,created_by) VALUES ($1,$2,$3,$4,$5)',
      [sub_id,'documento',`Nuovo documento: ${nomeFile}`,`Tipo: ${tipo||'documento'}`,req.user.id]);
  }
  res.json(r.rows[0]);
});

app.delete('/api/documenti/:id', authMiddleware, async (req, res) => {
  const r = await pool.query('SELECT cloudinary_id FROM documenti WHERE id=$1', [req.params.id]);
  if (r.rows[0]?.cloudinary_id && process.env.CLOUDINARY_CLOUD_NAME) {
    try { await cloudinary.uploader.destroy(r.rows[0].cloudinary_id, { resource_type: 'raw' }); } catch(e) {}
  }
  await pool.query('DELETE FROM documenti WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// Documenti in scadenza
app.get('/api/documenti/scadenze', authMiddleware, async (req, res) => {
  const r = await pool.query(`
    SELECT d.*,s.codice as sub_codice,sd.nome as sede_nome,
      (d.scadenza - CURRENT_DATE) as giorni_scadenza
    FROM documenti d
    LEFT JOIN subs s ON d.sub_id=s.id LEFT JOIN sedi sd ON d.sede_id=sd.id
    WHERE d.scadenza IS NOT NULL AND d.scadenza >= CURRENT_DATE
    ORDER BY d.scadenza ASC LIMIT 20`);
  res.json(r.rows);
});

// ═══════════════════════════════════════════════════════════
// CHAT INTELLIGENTE (senza AI key)
// ═══════════════════════════════════════════════════════════
app.post('/api/chat', authMiddleware, async (req, res) => {
  const { messaggio } = req.body;
  if (!messaggio) return res.json({ risposta: 'Scrivi un messaggio!', dati: [] });
  const m = messaggio.toLowerCase();
  let risposta = '', dati = [], tipo = 'testo';

  try {
    // Pattern: interventi per tipo/categoria
    if (m.includes('idraul') || m.includes('perdita') || m.includes('acqua')) {
      const r = await pool.query(`SELECT i.id,i.descrizione,i.prezzo,i.data_intervento,s.codice as sub,f.ragione_sociale as fornitore FROM interventi i LEFT JOIN subs s ON i.sub_id=s.id LEFT JOIN fornitori f ON i.fornitore_id=f.id WHERE i.tags @> ARRAY['idraulico'] OR i.descrizione ILIKE '%idraul%' OR i.descrizione ILIKE '%perdita%' ORDER BY i.data_intervento DESC LIMIT 10`);
      dati = r.rows; tipo = 'interventi';
      risposta = `Ho trovato **${r.rows.length} interventi idraulici**. ${r.rows.length ? `Totale spese: € ${r.rows.reduce((s,x)=>s+(parseFloat(x.prezzo)||0),0).toLocaleString('it-IT')}.` : ''}`;
    }
    else if (m.includes('elettr')) {
      const r = await pool.query(`SELECT i.id,i.descrizione,i.prezzo,i.data_intervento,s.codice as sub,f.ragione_sociale as fornitore FROM interventi i LEFT JOIN subs s ON i.sub_id=s.id LEFT JOIN fornitori f ON i.fornitore_id=f.id WHERE i.tags @> ARRAY['elettrico'] OR i.descrizione ILIKE '%elettr%' ORDER BY i.data_intervento DESC LIMIT 10`);
      dati = r.rows; tipo = 'interventi';
      risposta = `Ho trovato **${r.rows.length} interventi elettrici**. Totale: € ${r.rows.reduce((s,x)=>s+(parseFloat(x.prezzo)||0),0).toLocaleString('it-IT')}.`;
    }
    else if (m.includes('urgent') || m.includes('emergenza') || m.includes('attenzione')) {
      const r = await pool.query(`SELECT i.id,i.descrizione,i.prezzo,i.data_intervento,s.codice as sub,sd.nome as sede,f.ragione_sociale as fornitore FROM interventi i LEFT JOIN subs s ON i.sub_id=s.id LEFT JOIN sedi sd ON i.sede_id=sd.id LEFT JOIN fornitori f ON i.fornitore_id=f.id WHERE i.ha_notifica=true ORDER BY i.updated_at DESC LIMIT 10`);
      dati = r.rows; tipo = 'interventi';
      risposta = r.rows.length ? `⚠️ **${r.rows.length} interventi richiedono attenzione!**` : '✅ Nessun intervento urgente al momento.';
    }
    else if ((m.includes('spese') || m.includes('costi') || m.includes('quanto')) && (m.includes('fornitore') || m.includes('ditta'))) {
      const r = await pool.query(`SELECT f.ragione_sociale,COUNT(i.id) as num,COALESCE(SUM(i.prezzo),0) as totale FROM fornitori f LEFT JOIN interventi i ON i.fornitore_id=f.id GROUP BY f.id,f.ragione_sociale ORDER BY totale DESC LIMIT 10`);
      dati = r.rows; tipo = 'fornitori';
      risposta = `Ecco la **classifica fornitori per spesa**:`;
    }
    else if (m.includes('immobili') && (m.includes('pi') || m.includes('spese') || m.includes('costi'))) {
      const r = await pool.query(`SELECT s.codice as sub,sd.nome as sede,COUNT(i.id) as num,COALESCE(SUM(i.prezzo),0) as totale FROM subs s LEFT JOIN sedi sd ON s.sede_id=sd.id LEFT JOIN interventi i ON i.sub_id=s.id GROUP BY s.id,s.codice,sd.nome ORDER BY totale DESC LIMIT 10`);
      dati = r.rows; tipo = 'subs';
      risposta = `Ecco i **SUB con le spese più alte**:`;
    }
    else if (m.includes('scadenz')) {
      const r = await pool.query(`SELECT d.*,s.codice as sub_codice,sd.nome as sede_nome,(d.scadenza-CURRENT_DATE) as giorni FROM documenti d LEFT JOIN subs s ON d.sub_id=s.id LEFT JOIN sedi sd ON d.sede_id=sd.id WHERE d.scadenza IS NOT NULL AND d.scadenza >= CURRENT_DATE ORDER BY d.scadenza ASC LIMIT 10`);
      dati = r.rows; tipo = 'documenti';
      risposta = r.rows.length ? `📅 **${r.rows.length} documenti in scadenza** nei prossimi mesi:` : '✅ Nessuna scadenza imminente.';
    }
    else if (m.includes('ultimo ann') || m.includes('quest ann') || (m.includes('interventi') && m.includes('ann'))) {
      const anno = new Date().getFullYear();
      const r = await pool.query(`SELECT i.id,i.descrizione,i.prezzo,i.data_intervento,s.codice as sub,f.ragione_sociale as fornitore FROM interventi i LEFT JOIN subs s ON i.sub_id=s.id LEFT JOIN fornitori f ON i.fornitore_id=f.id WHERE i.anno_fattura=$1 ORDER BY i.data_intervento DESC LIMIT 15`,[anno]);
      const tot = r.rows.reduce((s,x)=>s+(parseFloat(x.prezzo)||0),0);
      dati = r.rows; tipo = 'interventi';
      risposta = `**Interventi ${anno}:** ${r.rows.length} totali, spesa € ${tot.toLocaleString('it-IT')}.`;
    }
    else if (m.includes('riepilog') || m.includes('situazione') || m.includes('riassun')) {
      const r = await pool.query(`SELECT COUNT(*) as num_int, COALESCE(SUM(prezzo),0) as totale,(SELECT COUNT(*) FROM subs) as num_subs,(SELECT COUNT(*) FROM fornitori) as num_forn,(SELECT COUNT(*) FROM documenti) as num_docs FROM interventi`);
      const d = r.rows[0];
      risposta = `📊 **Situazione attuale:**\n• ${d.num_int} interventi totali\n• € ${parseFloat(d.totale).toLocaleString('it-IT')} spese totali\n• ${d.num_subs} SUB gestiti\n• ${d.num_forn} fornitori\n• ${d.num_docs} documenti archiviati`;
      tipo = 'riepilogo';
    }
    else if (m.includes('sub ') || m.includes('immobile ')) {
      // Cerca SUB specifico
      const subCode = (m.match(/sub\s+([a-z0-9\-]+)/i) || m.match(/immobile\s+([a-z0-9\-]+)/i))?.[1]?.toUpperCase();
      if (subCode) {
        const sub = await pool.query(`SELECT s.*,sd.nome as sede,i.ragione_sociale as inquilino FROM subs s LEFT JOIN sedi sd ON s.sede_id=sd.id LEFT JOIN inquilini i ON s.inquilino_id=i.id WHERE UPPER(s.codice) LIKE $1 LIMIT 1`, [`%${subCode}%`]);
        if (sub.rows.length) {
          const s = sub.rows[0];
          const ints = await pool.query(`SELECT COUNT(*) as n, COALESCE(SUM(prezzo),0) as tot FROM interventi WHERE sub_id=$1`, [s.id]);
          risposta = `🏠 **SUB ${s.codice}** (${s.sede})\nInquilino: ${s.inquilino||'—'}\n${ints.rows[0].n} interventi · € ${parseFloat(ints.rows[0].tot).toLocaleString('it-IT')} totale\nSalute: ${s.stato_salute==='rosso'?'🔴 Critico':s.stato_salute==='giallo'?'🟡 Attenzione':'🟢 OK'}`;
          tipo = 'sub_detail';
        } else {
          risposta = `Non ho trovato nessun SUB con codice "${subCode}".`;
        }
      }
    }
    else if (m.includes('fornitore') || m.includes('ditta')) {
      const nome = m.replace(/fornitore|ditta|mostrami|trovami|cercami|informazioni su/gi,'').trim();
      if (nome.length > 2) {
        const r = await pool.query(`SELECT f.*,COUNT(i.id) as num_int,COALESCE(SUM(i.prezzo),0) as totale FROM fornitori f LEFT JOIN interventi i ON i.fornitore_id=f.id WHERE LOWER(f.ragione_sociale) LIKE $1 GROUP BY f.id ORDER BY totale DESC LIMIT 5`, [`%${nome}%`]);
        dati = r.rows; tipo = 'fornitori';
        risposta = r.rows.length ? `Ho trovato **${r.rows.length} fornitore/i** corrispondenti:` : `Nessun fornitore trovato per "${nome}".`;
      }
    }
    else if (m.includes('document') || m.includes('fattur') || m.includes('contratt')) {
      const r = await pool.query(`SELECT d.*,s.codice as sub_codice,sd.nome as sede_nome FROM documenti d LEFT JOIN subs s ON d.sub_id=s.id LEFT JOIN sedi sd ON d.sede_id=sd.id ORDER BY d.created_at DESC LIMIT 10`);
      dati = r.rows; tipo = 'documenti';
      risposta = `Ho trovato **${r.rows.length} documenti** recenti:`;
    }
    else {
      // Ricerca libera
      const r = await pool.query(`SELECT i.id,i.descrizione,i.prezzo,i.data_intervento,s.codice as sub,sd.nome as sede,f.ragione_sociale as fornitore FROM interventi i LEFT JOIN subs s ON i.sub_id=s.id LEFT JOIN sedi sd ON i.sede_id=sd.id LEFT JOIN fornitori f ON i.fornitore_id=f.id WHERE i.descrizione ILIKE $1 OR f.ragione_sociale ILIKE $1 OR s.codice ILIKE $1 ORDER BY i.data_intervento DESC LIMIT 8`, [`%${messaggio}%`]);
      if (r.rows.length) {
        dati = r.rows; tipo = 'interventi';
        risposta = `Ho trovato **${r.rows.length} risultati** per "${messaggio}":`;
      } else {
        risposta = `Non ho trovato risultati per "${messaggio}". Prova a chiedere:\n• "Mostrami interventi idraulici"\n• "Spese per fornitore"\n• "Interventi urgenti"\n• "Situazione SUB OB-01"\n• "Scadenze documenti"`;
      }
    }
  } catch(e) {
    risposta = 'Errore nella ricerca: ' + e.message;
  }

  res.json({ risposta, dati, tipo });
});


app.get('/api/fornitori', authMiddleware, async (req, res) => {
  const r = await pool.query(`
    SELECT f.*,
      (SELECT COUNT(*) FROM interventi WHERE fornitore_id=f.id) as num_interventi,
      (SELECT COALESCE(SUM(prezzo),0) FROM interventi WHERE fornitore_id=f.id) as totale_fatturato
    FROM fornitori f ORDER BY ragione_sociale`);
  res.json(r.rows);
});
app.post('/api/fornitori', authMiddleware, async (req, res) => {
  const f = req.body;
  const r = await pool.query(
    'INSERT INTO fornitori (codice_zuc,ragione_sociale,piva,cf,indirizzo,cap,citta,provincia,tel,email,spec) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
    [f.codice_zuc||null,f.ragione_sociale,f.piva||null,f.cf||null,f.indirizzo||null,f.cap||null,f.citta||null,f.provincia||null,f.tel||null,f.email||null,f.spec||null]
  );
  res.json(r.rows[0]);
});
app.put('/api/fornitori/:id', authMiddleware, async (req, res) => {
  const f = req.body;
  const r = await pool.query(
    'UPDATE fornitori SET codice_zuc=$1,ragione_sociale=$2,piva=$3,cf=$4,indirizzo=$5,cap=$6,citta=$7,provincia=$8,tel=$9,email=$10,spec=$11 WHERE id=$12 RETURNING *',
    [f.codice_zuc||null,f.ragione_sociale,f.piva||null,f.cf||null,f.indirizzo||null,f.cap||null,f.citta||null,f.provincia||null,f.tel||null,f.email||null,f.spec||null,req.params.id]
  );
  res.json(r.rows[0]);
});
app.delete('/api/fornitori/:id', authMiddleware, async (req, res) => {
  await pool.query('DELETE FROM fornitori WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});
app.post('/api/fornitori/import-bulk', authMiddleware, async (req, res) => {
  const { items } = req.body;
  let added = 0, skipped = 0;
  for (const f of items) {
    if (!f.ragione_sociale) { skipped++; continue; }
    const ex = await pool.query('SELECT id FROM fornitori WHERE LOWER(TRIM(ragione_sociale))=LOWER(TRIM($1))', [f.ragione_sociale]);
    if (ex.rows.length) { skipped++; continue; }
    await pool.query('INSERT INTO fornitori (codice_zuc,ragione_sociale,piva,cf,indirizzo,cap,citta,provincia,tel,email) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [f.codice_zuc||null,f.ragione_sociale,f.piva||null,f.cf||null,f.indirizzo||null,f.cap||null,f.citta||null,f.provincia||null,f.tel||null,f.email||null]);
    added++;
  }
  res.json({ added, skipped });
});

// ═══════════════════════════════════════════════════════════
// INQUILINI
// ═══════════════════════════════════════════════════════════
app.get('/api/inquilini', authMiddleware, async (req, res) => {
  const r = await pool.query('SELECT * FROM inquilini ORDER BY ragione_sociale');
  res.json(r.rows);
});
app.post('/api/inquilini', authMiddleware, async (req, res) => {
  const i = req.body;
  const r = await pool.query(
    'INSERT INTO inquilini (codice_zuc,ragione_sociale,piva,cf,indirizzo,cap,citta,provincia,tel,email) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
    [i.codice_zuc||null,i.ragione_sociale,i.piva||null,i.cf||null,i.indirizzo||null,i.cap||null,i.citta||null,i.provincia||null,i.tel||null,i.email||null]
  );
  res.json(r.rows[0]);
});
app.put('/api/inquilini/:id', authMiddleware, async (req, res) => {
  const i = req.body;
  const r = await pool.query(
    'UPDATE inquilini SET codice_zuc=$1,ragione_sociale=$2,piva=$3,cf=$4,indirizzo=$5,cap=$6,citta=$7,provincia=$8,tel=$9,email=$10 WHERE id=$11 RETURNING *',
    [i.codice_zuc||null,i.ragione_sociale,i.piva||null,i.cf||null,i.indirizzo||null,i.cap||null,i.citta||null,i.provincia||null,i.tel||null,i.email||null,req.params.id]
  );
  res.json(r.rows[0]);
});
app.delete('/api/inquilini/:id', authMiddleware, async (req, res) => {
  await pool.query('DELETE FROM inquilini WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});
app.post('/api/inquilini/import-bulk', authMiddleware, async (req, res) => {
  const { items } = req.body;
  let added = 0, skipped = 0;
  for (const i of items) {
    if (!i.ragione_sociale) { skipped++; continue; }
    const ex = await pool.query('SELECT id FROM inquilini WHERE LOWER(TRIM(ragione_sociale))=LOWER(TRIM($1))', [i.ragione_sociale]);
    if (ex.rows.length) { skipped++; continue; }
    await pool.query('INSERT INTO inquilini (codice_zuc,ragione_sociale,piva,cf,indirizzo,cap,citta,provincia,tel,email) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [i.codice_zuc||null,i.ragione_sociale,i.piva||null,i.cf||null,i.indirizzo||null,i.cap||null,i.citta||null,i.provincia||null,i.tel||null,i.email||null]);
    added++;
  }
  res.json({ added, skipped });
});

// ═══════════════════════════════════════════════════════════
// CATEGORIE
// ═══════════════════════════════════════════════════════════
app.get('/api/categorie', authMiddleware, async (req, res) => {
  const r = await pool.query('SELECT * FROM categorie ORDER BY nome');
  res.json(r.rows);
});
app.post('/api/categorie', authMiddleware, async (req, res) => {
  const { nome, colore, icona } = req.body;
  const r = await pool.query('INSERT INTO categorie (nome,colore,icona) VALUES ($1,$2,$3) RETURNING *', [nome, colore||'#2563eb', icona||'🔧']);
  res.json(r.rows[0]);
});
app.put('/api/categorie/:id', authMiddleware, async (req, res) => {
  const { nome, colore, icona } = req.body;
  const r = await pool.query('UPDATE categorie SET nome=$1,colore=$2,icona=$3 WHERE id=$4 RETURNING *', [nome, colore, icona, req.params.id]);
  res.json(r.rows[0]);
});
app.delete('/api/categorie/:id', authMiddleware, async (req, res) => {
  await pool.query('DELETE FROM categorie WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// AUTO TAGS
// ═══════════════════════════════════════════════════════════
function generateTags(descrizione, note) {
  const text = ((descrizione || '') + ' ' + (note || '')).toLowerCase();
  const rules = [
    { tags: ['elettrico', 'impianto elettrico'], keywords: ['elettr', 'quadro', 'presa', 'cavo', 'impianto elettr', 'salvavita', 'differenziale', 'interruttore'] },
    { tags: ['idraulico'], keywords: ['idraul', 'perdita', 'scarico', 'tubo', 'acqua', 'rubinett', 'sifone', 'fognatura'] },
    { tags: ['climatizzazione', 'cdz'], keywords: ['cdz', 'climat', 'condizion', 'split', 'fancoil', 'caldaia', 'riscaldamento', 'termoidraul'] },
    { tags: ['urgente'], keywords: ['urgent', 'emergenza', 'immediato', 'subito', 'pronto intervento'] },
    { tags: ['attenzione'], keywords: ['attenzione', 'da verificare', 'controllare', 'verificare', 'problema'] },
    { tags: ['sicurezza'], keywords: ['antincendio', 'estintore', 'sicurezza', 'allarme', 'sorveglianza', 'telecamera'] },
    { tags: ['edile'], keywords: ['murar', 'intonac', 'tintegg', 'vernic', 'paviment', 'piastrelle', 'cartongesso', 'soffitto'] },
    { tags: ['infiltrazione'], keywords: ['infiltraz', 'umidità', 'muffa', 'perdita', 'infiltr', 'acqua dal'] },
    { tags: ['manutenzione'], keywords: ['manutenzione', 'manutenzioni', 'programmata', 'periodica', 'revisione', 'controllo'] },
    { tags: ['ascensore'], keywords: ['ascensore', 'montacarichi', 'elevatore'] },
  ];
  const tags = new Set();
  rules.forEach(rule => {
    if (rule.keywords.some(k => text.includes(k))) {
      rule.tags.forEach(t => tags.add(t));
    }
  });
  // Notifica se parole critiche
  const criticalWords = ['urgente', 'attenzione', 'da verificare', 'controllare', 'problema', 'emergenza'];
  const hasNotifica = criticalWords.some(w => text.includes(w));
  return { tags: Array.from(tags), hasNotifica };
}

// ═══════════════════════════════════════════════════════════
// INTERVENTI
// ═══════════════════════════════════════════════════════════
app.get('/api/interventi', authMiddleware, async (req, res) => {
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

app.get('/api/interventi/:id', authMiddleware, async (req, res) => {
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
      const likeClause = words.map((w, i) => `descrizione ILIKE $${i + 2}`).join(' OR ');
      const simili = await pool.query(
        `SELECT id, data_intervento, descrizione, prezzo FROM interventi WHERE sub_id=$1 AND id!=${intervento.id} AND (${likeClause}) ORDER BY data_intervento DESC LIMIT 3`,
        [intervento.sub_id, ...words.map(w => `%${w}%`)]
      );
      intervento.interventi_simili = simili.rows;
    }
  }
  res.json(intervento);
});

app.post('/api/interventi', authMiddleware, async (req, res) => {
  const v = req.body;
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
  res.json(r.rows[0]);
});

app.put('/api/interventi/:id', authMiddleware, async (req, res) => {
  const v = req.body;
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
  res.json(r.rows[0]);
});

app.delete('/api/interventi/:id', authMiddleware, async (req, res) => {
  const inv = await pool.query('SELECT sub_id FROM interventi WHERE id=$1', [req.params.id]);
  await pool.query('DELETE FROM interventi WHERE id=$1', [req.params.id]);
  if (inv.rows[0]?.sub_id) await updateSaluteImmobile(inv.rows[0].sub_id);
  res.json({ ok: true });
});

// Delete massivo
app.post('/api/interventi/delete-bulk', authMiddleware, async (req, res) => {
  const { ids } = req.body;
  if (!ids?.length) return res.json({ deleted: 0 });
  const subIds = (await pool.query('SELECT DISTINCT sub_id FROM interventi WHERE id=ANY($1)', [ids])).rows.map(r => r.sub_id).filter(Boolean);
  await pool.query('DELETE FROM interventi WHERE id=ANY($1)', [ids]);
  for (const subId of subIds) await updateSaluteImmobile(subId);
  res.json({ deleted: ids.length });
});

// Duplicate check
app.post('/api/interventi/check-duplicate', authMiddleware, async (req, res) => {
  const { sub_id, fornitore_id, descrizione } = req.body;
  const r = await pool.query('SELECT * FROM interventi WHERE sub_id=$1 AND fornitore_id=$2', [sub_id, fornitore_id]);
  const words = (descrizione || '').toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const similar = r.rows.filter(x => {
    const d = (x.descrizione || '').toLowerCase();
    return words.length && words.filter(w => d.includes(w)).length / words.length > 0.4;
  });
  res.json({ duplicates: similar });
});

// ═══════════════════════════════════════════════════════════
// SALUTE IMMOBILE
// ═══════════════════════════════════════════════════════════
async function updateSaluteImmobile(subId) {
  const r = await pool.query(`
    SELECT COUNT(*) as cnt,
      SUM(CASE WHEN ha_notifica THEN 1 ELSE 0 END) as urgenti,
      SUM(CASE WHEN data_intervento >= NOW() - INTERVAL '12 months' THEN 1 ELSE 0 END) as ultimi12
    FROM interventi WHERE sub_id=$1`, [subId]);
  const { cnt, urgenti, ultimi12 } = r.rows[0];
  let salute = 'verde';
  if (parseInt(urgenti) > 0 || parseInt(ultimi12) >= 5) salute = 'rosso';
  else if (parseInt(ultimi12) >= 3) salute = 'giallo';
  await pool.query('UPDATE subs SET stato_salute=$1 WHERE id=$2', [salute, subId]);
}

// ═══════════════════════════════════════════════════════════
// ALLEGATI
// ═══════════════════════════════════════════════════════════
app.post('/api/allegati', authMiddleware, upload.single('file'), async (req, res) => {
  const { intervento_id, tipo } = req.body;
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Nessun file' });

  try {
    let url, cloudinary_id;
    if (process.env.CLOUDINARY_CLOUD_NAME) {
      const b64 = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
      const result = await cloudinary.uploader.upload(b64, {
        folder: 'gestionale-immobili',
        resource_type: 'auto'
      });
      url = result.secure_url;
      cloudinary_id = result.public_id;
    } else {
      // Fallback: base64 nel DB (solo sviluppo)
      url = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
      cloudinary_id = null;
    }
    const r = await pool.query(
      'INSERT INTO allegati (intervento_id,tipo,nome,url,cloudinary_id,dimensione,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [intervento_id, tipo || 'documento', file.originalname, url, cloudinary_id, file.size, req.user.id]
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/allegati/:id', authMiddleware, async (req, res) => {
  const r = await pool.query('SELECT cloudinary_id FROM allegati WHERE id=$1', [req.params.id]);
  if (r.rows[0]?.cloudinary_id && process.env.CLOUDINARY_CLOUD_NAME) {
    try { await cloudinary.uploader.destroy(r.rows[0].cloudinary_id); } catch(e) {}
  }
  await pool.query('DELETE FROM allegati WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// PAGAMENTI AFFITTO
// ═══════════════════════════════════════════════════════════
app.get('/api/pagamenti-affitto', authMiddleware, async (req, res) => {
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

app.post('/api/pagamenti-affitto', authMiddleware, async (req, res) => {
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

app.put('/api/pagamenti-affitto/:id', authMiddleware, async (req, res) => {
  const { importo, data_pagamento, stato, note } = req.body;
  const r = await pool.query(
    'UPDATE pagamenti_affitto SET importo=$1,data_pagamento=$2,stato=$3,note=$4 WHERE id=$5 RETURNING *',
    [importo, data_pagamento||null, stato||'pagato', note||null, req.params.id]
  );
  res.json(r.rows[0]);
});

app.delete('/api/pagamenti-affitto/:id', authMiddleware, async (req, res) => {
  await pool.query('DELETE FROM pagamenti_affitto WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// Genera pagamenti per tutti i mesi di un anno (canone da SUB)
app.post('/api/pagamenti-affitto/genera-anno', authMiddleware, async (req, res) => {
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

// ═══════════════════════════════════════════════════════════
// STORICO INQUILINI
// ═══════════════════════════════════════════════════════════
app.get('/api/storico-inquilini/:sub_id', authMiddleware, async (req, res) => {
  const r = await pool.query(`
    SELECT si.*,i.ragione_sociale as inquilino_nome,i.tel,i.email,i.cf,i.piva
    FROM storico_inquilini si LEFT JOIN inquilini i ON si.inquilino_id=i.id
    WHERE si.sub_id=$1 ORDER BY si.data_inizio DESC NULLS LAST`, [req.params.sub_id]);
  res.json(r.rows);
});

app.post('/api/storico-inquilini', authMiddleware, async (req, res) => {
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

app.delete('/api/storico-inquilini/:id', authMiddleware, async (req, res) => {
  await pool.query('DELETE FROM storico_inquilini WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// Cambia inquilino corrente (chiude il vecchio, apre il nuovo)
app.post('/api/subs/:id/cambia-inquilino', authMiddleware, async (req, res) => {
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

// ═══════════════════════════════════════════════════════════
// SCISSIONE SUB
// ═══════════════════════════════════════════════════════════
app.post('/api/subs/:id/scissione', authMiddleware, async (req, res) => {
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

// ═══════════════════════════════════════════════════════════
// REDDITIVITÀ GLOBALE
// ═══════════════════════════════════════════════════════════
app.get('/api/redditivita', authMiddleware, async (req, res) => {
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

// ═══════════════════════════════════════════════════════════
// BOLLETTE
// ═══════════════════════════════════════════════════════════
app.get('/api/bollette', authMiddleware, async (req, res) => {
  const { sub_id, tipo, stato } = req.query;
  let where=['1=1'],params=[],p=1;
  if(sub_id){where.push(`b.sub_id=$${p++}`);params.push(sub_id);}
  if(tipo){where.push(`b.tipo=$${p++}`);params.push(tipo);}
  if(stato){where.push(`b.stato=$${p++}`);params.push(stato);}
  const r = await pool.query(`
    SELECT b.*,s.codice as sub_codice,sd.nome as sede_nome,(b.scadenza-CURRENT_DATE) as giorni_scadenza
    FROM bollette b LEFT JOIN subs s ON b.sub_id=s.id LEFT JOIN sedi sd ON s.sede_id=sd.id
    WHERE ${where.join(' AND ')} ORDER BY b.scadenza ASC NULLS LAST`,params);
  res.json(r.rows);
});
app.post('/api/bollette', authMiddleware, upload.single('file'), async (req, res) => {
  const f = req.body;
  let url=null,cloudinary_id=null;
  if(req.file){
    if(process.env.CLOUDINARY_CLOUD_NAME){
      const b64=`data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
      const result=await cloudinary.uploader.upload(b64,{folder:'gestionale-bollette',resource_type:'auto'});
      url=result.secure_url;cloudinary_id=result.public_id;
    }
  }
  const r = await pool.query(
    `INSERT INTO bollette (sub_id,tipo,fornitore_nome,numero,importo,periodo_dal,periodo_al,scadenza,data_pagamento,stato,url,cloudinary_id,note,created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [f.sub_id||null,f.tipo||'altro',f.fornitore_nome||null,f.numero||null,f.importo||null,
     f.periodo_dal||null,f.periodo_al||null,f.scadenza||null,f.data_pagamento||null,
     f.stato||'da_pagare',url,cloudinary_id,f.note||null,req.user.id]);
  if(f.sub_id) await pool.query('INSERT INTO sub_storia (sub_id,tipo,titolo,descrizione,created_by) VALUES ($1,$2,$3,$4,$5)',
    [f.sub_id,'bolletta',`Bolletta ${f.tipo||'altro'} ${f.fornitore_nome||''}`,`€ ${f.importo||'—'} — Scadenza: ${f.scadenza||'—'}`,req.user.id]);
  res.json(r.rows[0]);
});
app.put('/api/bollette/:id', authMiddleware, async (req, res) => {
  const f=req.body;
  const r=await pool.query(
    'UPDATE bollette SET tipo=$1,fornitore_nome=$2,numero=$3,importo=$4,periodo_dal=$5,periodo_al=$6,scadenza=$7,data_pagamento=$8,stato=$9,note=$10 WHERE id=$11 RETURNING *',
    [f.tipo,f.fornitore_nome||null,f.numero||null,f.importo||null,f.periodo_dal||null,f.periodo_al||null,f.scadenza||null,f.data_pagamento||null,f.stato||'da_pagare',f.note||null,req.params.id]);
  res.json(r.rows[0]);
});
app.delete('/api/bollette/:id', authMiddleware, async (req, res) => {
  await pool.query('DELETE FROM bollette WHERE id=$1',[req.params.id]);res.json({ok:true});
});

// ═══════════════════════════════════════════════════════════
// TICKET
// ═══════════════════════════════════════════════════════════
app.get('/api/ticket', authMiddleware, async (req, res) => {
  const {sub_id,stato,priorita}=req.query;
  let where=['1=1'],params=[],p=1;
  if(sub_id){where.push(`t.sub_id=$${p++}`);params.push(sub_id);}
  if(stato){where.push(`t.stato=$${p++}`);params.push(stato);}
  if(priorita){where.push(`t.priorita=$${p++}`);params.push(priorita);}
  const r=await pool.query(`
    SELECT t.*,s.codice as sub_codice,sd.nome as sede_nome,i.ragione_sociale as inquilino_nome,
      u.nome as assegnato_nome,uc.nome as autore
    FROM ticket t LEFT JOIN subs s ON t.sub_id=s.id LEFT JOIN sedi sd ON s.sede_id=sd.id
    LEFT JOIN inquilini i ON t.inquilino_id=i.id LEFT JOIN users u ON t.assegnato_a=u.id
    LEFT JOIN users uc ON t.created_by=uc.id
    WHERE ${where.join(' AND ')} ORDER BY t.created_at DESC`,params);
  res.json(r.rows);
});
app.post('/api/ticket', authMiddleware, async (req, res) => {
  const f=req.body;
  const r=await pool.query(
    'INSERT INTO ticket (sub_id,inquilino_id,titolo,descrizione,categoria,priorita,stato,assegnato_a,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
    [f.sub_id||null,f.inquilino_id||null,f.titolo,f.descrizione||null,f.categoria||null,f.priorita||'normale',f.stato||'aperto',f.assegnato_a||null,req.user.id]);
  if(f.sub_id) await pool.query('INSERT INTO sub_storia (sub_id,tipo,titolo,descrizione,created_by) VALUES ($1,$2,$3,$4,$5)',
    [f.sub_id,'ticket',`Ticket: ${f.titolo}`,f.descrizione||'',req.user.id]);
  res.json(r.rows[0]);
});
app.put('/api/ticket/:id', authMiddleware, async (req, res) => {
  const f=req.body;
  const chiusura=f.stato==='chiuso'?'NOW()':null;
  const r=await pool.query(
    'UPDATE ticket SET titolo=$1,descrizione=$2,categoria=$3,priorita=$4,stato=$5,assegnato_a=$6,data_chiusura=COALESCE($7::TIMESTAMP,data_chiusura),updated_at=NOW() WHERE id=$8 RETURNING *',
    [f.titolo,f.descrizione||null,f.categoria||null,f.priorita||'normale',f.stato||'aperto',f.assegnato_a||null,chiusura,req.params.id]);
  res.json(r.rows[0]);
});
app.delete('/api/ticket/:id', authMiddleware, async (req, res) => {
  await pool.query('DELETE FROM ticket WHERE id=$1',[req.params.id]);res.json({ok:true});
});

// ═══════════════════════════════════════════════════════════
// FUSIONE SUB
// ═══════════════════════════════════════════════════════════
app.post('/api/subs/fusione', authMiddleware, async (req, res) => {
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

// Aggiorna scissione per registrare relazione genealogica
app.post('/api/subs/:id/scissione', authMiddleware, async (req, res) => {
  const {nuovo_codice,note_scissione}=req.body;
  if(!nuovo_codice) return res.status(400).json({error:'Codice nuovo SUB obbligatorio'});
  const orig=await pool.query('SELECT * FROM subs WHERE id=$1',[req.params.id]);
  if(!orig.rows.length) return res.status(404).json({error:'SUB non trovato'});
  const s=orig.rows[0];
  const nuovo=await pool.query(
    `INSERT INTO subs (codice,ex_sub,sede_id,piano,foglio,particella,categoria_cat,classe_energetica,anno_costruzione,indirizzo_completo,stato_occupazione,note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [nuovo_codice,s.codice,s.sede_id,s.piano,s.foglio,s.particella,s.categoria_cat,s.classe_energetica,s.anno_costruzione,s.indirizzo_completo,'libero',note_scissione||null]);
  const nid=nuovo.rows[0].id;
  await pool.query('INSERT INTO sub_relazioni (sub_padre,sub_figlio,tipo,data,note,created_by) VALUES ($1,$2,$3,$4,$5,$6)',
    [req.params.id,nid,'scissione',new Date().toISOString().split('T')[0],note_scissione||null,req.user.id]);
  const desc=`Scissione da SUB ${s.codice}. ${note_scissione||''}`;
  await pool.query('INSERT INTO sub_storia (sub_id,tipo,titolo,descrizione,created_by) VALUES ($1,$2,$3,$4,$5)',[req.params.id,'scissione',`Scissione → SUB ${nuovo_codice}`,desc,req.user.id]);
  await pool.query('INSERT INTO sub_storia (sub_id,tipo,titolo,descrizione,created_by) VALUES ($1,$2,$3,$4,$5)',[nid,'creazione',`Creato da scissione SUB ${s.codice}`,desc,req.user.id]);
  res.json({originale:s,nuovo:nuovo.rows[0]});
});

// Genealogia SUB
app.get('/api/subs/:id/genealogia', authMiddleware, async (req, res) => {
  const id=req.params.id;
  const [padri,figli,sub]=await Promise.all([
    pool.query(`SELECT r.*,s.codice as codice_padre,s.stato_salute FROM sub_relazioni r LEFT JOIN subs s ON r.sub_padre=s.id WHERE r.sub_figlio=$1`,[id]),
    pool.query(`SELECT r.*,s.codice as codice_figlio,s.stato_salute FROM sub_relazioni r LEFT JOIN subs s ON r.sub_figlio=s.id WHERE r.sub_padre=$1`,[id]),
    pool.query(`SELECT id,codice,ex_sub,stato_salute FROM subs WHERE id=$1`,[id]),
  ]);
  res.json({sub:sub.rows[0],padri:padri.rows,figli:figli.rows});
});

// ═══════════════════════════════════════════════════════════
// CALENDARIO / SCADENZE GLOBALI
// ═══════════════════════════════════════════════════════════
app.get('/api/calendario', authMiddleware, async (req, res) => {
  const {mese,anno}=req.query;
  const dal=mese&&anno?`${anno}-${String(mese).padStart(2,'0')}-01`:null;
  const al=mese&&anno?new Date(parseInt(anno),parseInt(mese),0).toISOString().split('T')[0]:null;
  const where=dal?`AND scadenza BETWEEN '${dal}' AND '${al}'`:'AND scadenza >= CURRENT_DATE AND scadenza <= CURRENT_DATE + INTERVAL \'90 days\'';
  const [docs,mans,bolls,pags]=await Promise.all([
    pool.query(`SELECT 'documento' as tipo,'📄' as icon,d.nome as titolo,d.scadenza,s.codice as sub,sd.nome as sede FROM documenti d LEFT JOIN subs s ON d.sub_id=s.id LEFT JOIN sedi sd ON d.sede_id=sd.id WHERE d.scadenza IS NOT NULL ${where} ORDER BY d.scadenza`),
    pool.query(`SELECT 'manutenzione' as tipo,'🔨' as icon,m.tipo as titolo,m.prossima_scadenza as scadenza,s.codice as sub,sd.nome as sede,m.priorita FROM manutenzioni m LEFT JOIN subs s ON m.sub_id=s.id LEFT JOIN sedi sd ON m.sede_id=sd.id WHERE m.prossima_scadenza IS NOT NULL AND m.stato!='annullata' ${where.replace(/scadenza/g,'prossima_scadenza')} ORDER BY m.prossima_scadenza`),
    pool.query(`SELECT 'bolletta' as tipo,'⚡' as icon,b.tipo||' '||COALESCE(b.fornitore_nome,'') as titolo,b.scadenza,s.codice as sub,sd.nome as sede FROM bollette b LEFT JOIN subs s ON b.sub_id=s.id LEFT JOIN sedi sd ON s.sede_id=sd.id WHERE b.scadenza IS NOT NULL AND b.stato='da_pagare' ${where} ORDER BY b.scadenza`),
    pool.query(`SELECT 'contratto_istat' as tipo,'📈' as icon,'ISTAT: SUB '||s.codice as titolo,(s.data_inizio_contratto + INTERVAL '12 months')::DATE as scadenza,s.codice as sub,sd.nome as sede FROM subs s LEFT JOIN sedi sd ON s.sede_id=sd.id WHERE s.data_inizio_contratto IS NOT NULL AND s.canone_annuo IS NOT NULL AND (s.data_inizio_contratto + INTERVAL '12 months') >= CURRENT_DATE`),
  ]);
  const events=[...docs.rows,...mans.rows,...bolls.rows,...pags.rows].sort((a,b)=>new Date(a.scadenza)-new Date(b.scadenza));
  res.json(events);
});

// ═══════════════════════════════════════════════════════════
// NEWS IMMOBILIARE
// ═══════════════════════════════════════════════════════════
app.get('/api/news', authMiddleware, async (req, res) => {
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

app.get('/api/manutenzioni', authMiddleware, async (req, res) => {
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

app.post('/api/manutenzioni', authMiddleware, async (req, res) => {
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

app.put('/api/manutenzioni/:id', authMiddleware, async (req, res) => {
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

app.delete('/api/manutenzioni/:id', authMiddleware, async (req, res) => {
  await pool.query('DELETE FROM manutenzioni WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/manutenzioni/scadenze', authMiddleware, async (req, res) => {
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

// ═══════════════════════════════════════════════════════════
// ISTAT
// ═══════════════════════════════════════════════════════════
app.get('/api/istat/calcola', authMiddleware, async (req, res) => {
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

// ═══════════════════════════════════════════════════════════
// RICERCA GLOBALE
// ═══════════════════════════════════════════════════════════
app.get('/api/search', authMiddleware, async (req, res) => {
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

// ═══════════════════════════════════════════════════════════
// RIEPILOGO / DASHBOARD
// ═══════════════════════════════════════════════════════════
app.get('/api/dashboard', authMiddleware, async (req, res) => {
  const [totali, ultimi, notifiche, subsCritici, scadenzeDoc, scadenzeMan, istatSubs, subsIncompleti] = await Promise.all([
    pool.query(`SELECT COUNT(*) as num_interventi, COALESCE(SUM(prezzo),0) as totale_spese,
      (SELECT COUNT(*) FROM subs) as num_subs,
      (SELECT COUNT(*) FROM fornitori) as num_fornitori,
      (SELECT COUNT(*) FROM documenti) as num_documenti,
      (SELECT COUNT(*) FROM manutenzioni WHERE stato='programmata') as manutenzioni_aperte
      FROM interventi`),
    pool.query(`SELECT i.id, i.descrizione, i.prezzo, i.data_intervento, s.codice as sub, f.ragione_sociale as fornitore, sd.nome as sede
      FROM interventi i LEFT JOIN subs s ON i.sub_id=s.id LEFT JOIN fornitori f ON i.fornitore_id=f.id LEFT JOIN sedi sd ON i.sede_id=sd.id
      ORDER BY i.created_at DESC LIMIT 5`),
    pool.query(`SELECT i.id, i.descrizione, i.ha_notifica, s.codice as sub, sd.nome as sede
      FROM interventi i LEFT JOIN subs s ON i.sub_id=s.id LEFT JOIN sedi sd ON i.sede_id=sd.id
      WHERE i.ha_notifica=true ORDER BY i.updated_at DESC LIMIT 8`),
    // SUB critici (rosso/giallo o con molte urgenze)
    pool.query(`SELECT s.id, s.codice, s.stato_salute, s.stato_occupazione, sd.nome as sede,
      i.ragione_sociale as inquilino,
      (SELECT COUNT(*) FROM interventi WHERE sub_id=s.id AND ha_notifica=true) as urgenze,
      (SELECT COALESCE(SUM(prezzo),0) FROM interventi WHERE sub_id=s.id) as totale_spese
      FROM subs s LEFT JOIN sedi sd ON s.sede_id=sd.id LEFT JOIN inquilini i ON s.inquilino_id=i.id
      WHERE s.stato_salute IN ('rosso','giallo') OR EXISTS(SELECT 1 FROM interventi WHERE sub_id=s.id AND ha_notifica=true)
      ORDER BY s.stato_salute DESC, urgenze DESC LIMIT 8`),
    // Scadenze documenti prossime 60gg
    pool.query(`SELECT d.id, d.nome, d.tipo, d.scadenza, s.codice as sub_codice, sd.nome as sede_nome,
      (d.scadenza - CURRENT_DATE) as giorni
      FROM documenti d LEFT JOIN subs s ON d.sub_id=s.id LEFT JOIN sedi sd ON d.sede_id=sd.id
      WHERE d.scadenza IS NOT NULL AND d.scadenza >= CURRENT_DATE AND d.scadenza <= CURRENT_DATE + INTERVAL '60 days'
      ORDER BY d.scadenza ASC LIMIT 8`),
    // Scadenze manutenzioni prossime 60gg
    pool.query(`SELECT m.id, m.tipo, m.priorita, m.prossima_scadenza as scadenza, s.codice as sub_codice, sd.nome as sede_nome,
      (m.prossima_scadenza - CURRENT_DATE) as giorni
      FROM manutenzioni m LEFT JOIN subs s ON m.sub_id=s.id LEFT JOIN sedi sd ON m.sede_id=sd.id
      WHERE m.prossima_scadenza IS NOT NULL AND m.prossima_scadenza >= CURRENT_DATE AND m.prossima_scadenza <= CURRENT_DATE + INTERVAL '60 days'
      AND m.stato != 'annullata' ORDER BY m.prossima_scadenza ASC LIMIT 8`),
    // SUB con ISTAT dovuto (contratto > 12 mesi senza traccia di adeguamento)
    pool.query(`SELECT s.id, s.codice, s.data_inizio_contratto, s.canone_annuo, s.tipo_contratto, sd.nome as sede,
      EXTRACT(MONTH FROM AGE(NOW(), s.data_inizio_contratto)) +
      EXTRACT(YEAR FROM AGE(NOW(), s.data_inizio_contratto)) * 12 as mesi_contratto
      FROM subs s LEFT JOIN sedi sd ON s.sede_id=sd.id
      WHERE s.data_inizio_contratto IS NOT NULL AND s.canone_annuo IS NOT NULL
        AND AGE(NOW(), s.data_inizio_contratto) >= INTERVAL '12 months'
      ORDER BY s.data_inizio_contratto ASC LIMIT 5`),
    // SUB con dati incompleti (senza inquilino, senza sede, senza dati catastali)
    pool.query(`SELECT s.id, s.codice, sd.nome as sede,
      CASE WHEN s.inquilino_id IS NULL THEN 'Manca inquilino' WHEN s.foglio IS NULL THEN 'Dati catastali incompleti' WHEN s.canone_annuo IS NULL THEN 'Manca canone' ELSE 'Dati da completare' END as problema
      FROM subs s LEFT JOIN sedi sd ON s.sede_id=sd.id
      WHERE s.inquilino_id IS NULL OR s.foglio IS NULL OR s.canone_annuo IS NULL
      ORDER BY s.codice LIMIT 6`),
  ]);
  res.json({
    totali: totali.rows[0],
    ultimi: ultimi.rows,
    notifiche: notifiche.rows,
    subsCritici: subsCritici.rows,
    scadenzeDoc: scadenzeDoc.rows,
    scadenzeMan: scadenzeMan.rows,
    istatSubs: istatSubs.rows,
    subsIncompleti: subsIncompleti.rows,
  });
});

// API notifiche dedicate
app.get('/api/notifiche', authMiddleware, async (req, res) => {
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


    pool.query(`SELECT COUNT(*) as num_interventi, COALESCE(SUM(prezzo),0) as totale_spese,
      (SELECT COUNT(*) FROM subs) as num_subs,
      (SELECT COUNT(*) FROM fornitori) as num_fornitori FROM interventi`),
app.get('/api/riepilogo', authMiddleware, async (req, res) => {
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

// ═══════════════════════════════════════════════════════════
// ESTRAZIONE PREZZI DA TESTO (regex, no API needed)
// ═══════════════════════════════════════════════════════════
function extractPriceFromText(text) {
  if (!text) return null;
  const t = String(text);
  const found = [];

  // Pattern €1.500,00 o € 1500,00
  const p1 = /€\s*([\d]{1,3}(?:[.,]\d{3})*(?:[,\.]\d{1,2})?)/g;
  // Pattern 1.500,00€ o 1500 €
  const p2 = /([\d]{1,3}(?:[.,]\d{3})*(?:[,\.]\d{1,2})?)\s*€/g;
  // Pattern totale/importo/imponibile/costo: 1500
  const p3 = /(?:totale|importo|imponibile|costo|prezzo)[:\s]+(?:di\s+)?€?\s*([\d]{1,3}(?:[.,]\d{3})*(?:[,\.]\d{1,2})?)/gi;
  // Pattern euro 1500
  const p4 = /(?:euro|eur)\s+([\d]{1,3}(?:[.,]\d{3})*(?:[,\.]\d{1,2})?)/gi;

  const parseItalian = raw => {
    if (!raw) return NaN;
    // Es: 1.500,00 → 1500.00 | 1500,00 → 1500.00 | 1.500 → 1500
    if (raw.includes(',') && raw.includes('.')) {
      const li = raw.lastIndexOf(','), ld = raw.lastIndexOf('.');
      return li > ld
        ? parseFloat(raw.replace(/\./g,'').replace(',','.'))
        : parseFloat(raw.replace(/,/g,''));
    }
    if (raw.includes(',')) {
      const parts = raw.split(',');
      return parts[parts.length-1].length <= 2
        ? parseFloat(raw.replace(',','.'))
        : parseFloat(raw.replace(/,/g,''));
    }
    if (raw.includes('.')) {
      const parts = raw.split('.');
      return parts[parts.length-1].length <= 2 && parts.length === 2
        ? parseFloat(raw)
        : parseFloat(raw.replace(/\./g,''));
    }
    return parseFloat(raw);
  };

  for (const pat of [p1,p2,p3,p4]) {
    let m;
    const re = new RegExp(pat.source, pat.flags);
    while ((m = re.exec(t)) !== null) {
      const n = parseItalian(m[1]);
      if (!isNaN(n) && n > 0 && n < 10000000) found.push(n);
    }
  }
  if (!found.length) return null;
  return Math.max(...found); // Restituisce il valore più alto (di solito il totale)
}

// Estrai prezzi da tutti gli interventi senza prezzo
app.post('/api/interventi/extract-prices', authMiddleware, async (req, res) => {
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

// ═══════════════════════════════════════════════════════════
// RIEPILOGO AVANZATO
// ═══════════════════════════════════════════════════════════

// Per Fornitore
app.get('/api/riepilogo/fornitori', authMiddleware, async (req, res) => {
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

// Per Anno
app.get('/api/riepilogo/anni', authMiddleware, async (req, res) => {
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

// Per Mese (ultimi 24 mesi)
app.get('/api/riepilogo/mesi', authMiddleware, async (req, res) => {
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

// Per Sede
app.get('/api/riepilogo/sedi', authMiddleware, async (req, res) => {
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


app.post('/api/interventi/import-storico', authMiddleware, async (req, res) => {
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
      let found=arr.find(x=>norm(x.ragione_sociale)===n)||arr.find(x=>norm(x.ragione_sociale).includes(n)||n.includes(norm(x.ragione_sociale)));
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
      const s=String(v).replace(/[€$£\s]/g,'').replace(',','.');
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

// ═══════════════════════════════════════════════════════════
// OCR FATTURA (AI) — opzionale, richiede ANTHROPIC_API_KEY
// ═══════════════════════════════════════════════════════════
app.post('/api/ocr', authMiddleware, upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Nessun file' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'ANTHROPIC_API_KEY non configurata nelle variabili Railway' });
  const mimeMap = { 'image/jpeg':'image/jpeg','image/png':'image/png','image/gif':'image/gif','image/webp':'image/webp','application/pdf':'application/pdf' };
  const mediaType = mimeMap[file.mimetype] || 'image/jpeg';
  const b64 = file.buffer.toString('base64');
  try {
    const https = require('https');
    const payload = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: mediaType==='application/pdf'?'document':'image', source: { type:'base64', media_type:mediaType, data:b64 } },
          { type: 'text', text: 'Estrai da questa fattura/documento i seguenti dati in formato JSON puro (senza markdown): {"fornitore":"","num_fattura":"","data_fattura":"YYYY-MM-DD","importo":0,"descrizione":""}. Se un dato manca usa null.' }
        ]
      }]
    });
    const result = await new Promise((resolve, reject) => {
      const r = https.request('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{ 'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','Content-Length':Buffer.byteLength(payload) }
      }, (resp) => { let d=''; resp.on('data',c=>d+=c); resp.on('end',()=>resolve(d)); });
      r.on('error', reject); r.write(payload); r.end();
    });
    const parsed = JSON.parse(result);
    const text = parsed.content?.[0]?.text || '{}';
    const clean = text.replace(/```json|```/g,'').trim();
    res.json({ dati: JSON.parse(clean) });
  } catch(e) { res.status(500).json({ error: 'Errore OCR: ' + e.message }); }
});

// ═══════════════════════════════════════════════════════════
// SPA fallback — serve index.html per ogni rotta non-API
// ═══════════════════════════════════════════════════════════
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Endpoint non trovato' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ═══════════════════════════════════════════════════════════
// AVVIO SERVER
// ═══════════════════════════════════════════════════════════
initDB()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Gestionale V3 in ascolto sulla porta ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ Errore inizializzazione DB:', err);
    // Avvia comunque il server così l'app risponde anche se il DB ha problemi
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`⚠️ Server avviato sulla porta ${PORT} (DB non inizializzato)`);
    });
  });
