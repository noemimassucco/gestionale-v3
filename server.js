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
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(200) UNIQUE NOT NULL,
        password_hash VARCHAR(200) NOT NULL,
        nome VARCHAR(100),
        ruolo VARCHAR(50) DEFAULT 'operatore',
        attivo BOOLEAN DEFAULT true,
        ultimo_accesso TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS sedi (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        indirizzo TEXT,
        citta VARCHAR(100),
        note TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS inquilini (
        id SERIAL PRIMARY KEY,
        codice_zuc VARCHAR(50),
        ragione_sociale VARCHAR(200) NOT NULL,
        piva VARCHAR(20), cf VARCHAR(20),
        indirizzo TEXT, cap VARCHAR(10),
        citta VARCHAR(100), provincia VARCHAR(5),
        tel VARCHAR(50), email VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS fornitori (
        id SERIAL PRIMARY KEY,
        codice_zuc VARCHAR(50),
        ragione_sociale VARCHAR(200) NOT NULL,
        piva VARCHAR(20), cf VARCHAR(20),
        indirizzo TEXT, cap VARCHAR(10),
        citta VARCHAR(100), provincia VARCHAR(5),
        tel VARCHAR(50), email VARCHAR(100), spec VARCHAR(200),
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS subs (
        id SERIAL PRIMARY KEY,
        codice VARCHAR(50) NOT NULL,
        ex_sub VARCHAR(50),
        sede_id INTEGER REFERENCES sedi(id),
        piano VARCHAR(100),
        inquilino_id INTEGER,
        stato_salute VARCHAR(10) DEFAULT 'verde',
        note TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS categorie (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        colore VARCHAR(20) DEFAULT '#2563eb',
        icona VARCHAR(50) DEFAULT '🔧'
      );
      CREATE TABLE IF NOT EXISTS interventi (
        id SERIAL PRIMARY KEY,
        sub_id INTEGER REFERENCES subs(id),
        sede_id INTEGER REFERENCES sedi(id),
        fornitore_id INTEGER REFERENCES fornitori(id),
        inquilino_id INTEGER,
        categoria_id INTEGER REFERENCES categorie(id),
        protocollo VARCHAR(100),
        num_fattura VARCHAR(100),
        data_intervento DATE,
        data_fattura DATE,
        anno_fattura INTEGER,
        prezzo DECIMAL(12,2),
        descrizione TEXT,
        note TEXT,
        tags TEXT[],
        ha_notifica BOOLEAN DEFAULT false,
        created_by INTEGER REFERENCES users(id),
        updated_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS allegati (
        id SERIAL PRIMARY KEY,
        intervento_id INTEGER REFERENCES interventi(id) ON DELETE CASCADE,
        tipo VARCHAR(50),
        nome VARCHAR(200),
        url TEXT,
        cloudinary_id VARCHAR(200),
        dimensione INTEGER,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS contratti (
        id SERIAL PRIMARY KEY,
        sub_id INTEGER REFERENCES subs(id),
        fornitore_id INTEGER REFERENCES fornitori(id),
        tipo VARCHAR(100),
        nome VARCHAR(200),
        url TEXT,
        cloudinary_id VARCHAR(200),
        data_inizio DATE,
        data_scadenza DATE,
        note TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT,
        updated_by INTEGER,
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- Default data
      INSERT INTO settings (key, value) VALUES
        ('app_name', 'Gestionale Immobili'),
        ('logo_url', ''),
        ('colore_primario', '#2563eb'),
        ('footer_text', 'Gestionale Immobili — Storico Interventi')
      ON CONFLICT (key) DO NOTHING;

      INSERT INTO categorie (nome, colore, icona) VALUES
        ('Elettrico', '#f59e0b', '⚡'),
        ('Idraulico', '#3b82f6', '🔧'),
        ('Climatizzazione', '#06b6d4', '❄️'),
        ('Edile', '#8b5cf6', '🏗️'),
        ('Sicurezza', '#ef4444', '🔒'),
        ('Ascensori', '#6b7280', '🛗'),
        ('Pulizie', '#10b981', '🧹'),
        ('Manutenzione', '#f97316', '🔨'),
        ('Altro', '#94a3b8', '📋')
      ON CONFLICT DO NOTHING;

      INSERT INTO sedi (nome, citta) VALUES
        ('Orbassano', 'Orbassano'),
        ('Rivoli', 'Rivoli')
      ON CONFLICT DO NOTHING;
    `);

    // Admin user default
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@gestionale.it';
    const adminPwd = process.env.ADMIN_PASSWORD || 'Admin2024!';
    const existing = await client.query('SELECT id FROM users WHERE email=$1', [adminEmail]);
    if (!existing.rows.length) {
      const hash = await bcrypt.hash(adminPwd, 10);
      await client.query(
        "INSERT INTO users (email, password_hash, nome, ruolo) VALUES ($1,$2,'Amministratore','admin')",
        [adminEmail, hash]
      );
    }
    console.log('✅ Database V3 inizializzato');
  } finally { client.release(); }
}

// ═══════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════
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
app.get('/api/settings', authMiddleware, async (req, res) => {
  const r = await pool.query('SELECT key,value FROM settings');
  const obj = {};
  r.rows.forEach(row => obj[row.key] = row.value);
  res.json(obj);
});
app.post('/api/settings', authMiddleware, async (req, res) => {
  const { settings } = req.body;
  for (const [key, value] of Object.entries(settings)) {
    await pool.query(
      'INSERT INTO settings (key,value,updated_by,updated_at) VALUES ($1,$2,$3,NOW()) ON CONFLICT(key) DO UPDATE SET value=$2,updated_by=$3,updated_at=NOW()',
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
app.get('/api/subs', authMiddleware, async (req, res) => {
  const r = await pool.query(`
    SELECT s.*, sd.nome as sede_nome, i.ragione_sociale as inquilino_nome,
      (SELECT COUNT(*) FROM interventi WHERE sub_id=s.id) as num_interventi,
      (SELECT COALESCE(SUM(prezzo),0) FROM interventi WHERE sub_id=s.id) as totale_spese
    FROM subs s
    LEFT JOIN sedi sd ON s.sede_id=sd.id
    LEFT JOIN inquilini i ON s.inquilino_id=i.id
    ORDER BY sd.nome, s.codice`);
  res.json(r.rows);
});
app.post('/api/subs', authMiddleware, async (req, res) => {
  const { codice, ex_sub, sede_id, piano, inquilino_id, note } = req.body;
  const r = await pool.query(
    'INSERT INTO subs (codice,ex_sub,sede_id,piano,inquilino_id,note) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [codice, ex_sub||null, sede_id||null, piano||null, inquilino_id||null, note||null]
  );
  res.json(r.rows[0]);
});
app.post('/api/subs/import-bulk', authMiddleware, async (req, res) => {
  const { items } = req.body;
  const client = await pool.connect();
  let added = 0, skipped = 0, errors = [];
  try {
    await client.query('BEGIN');
    const sedi = (await client.query('SELECT * FROM sedi')).rows;
    const inquilini = (await client.query('SELECT * FROM inquilini')).rows;
    const norm = s => (s||'').toLowerCase().trim();

    for (const item of items) {
      if (!item.codice) { skipped++; continue; }
      // Controlla duplicati per codice
      const ex = await client.query('SELECT id FROM subs WHERE LOWER(TRIM(codice))=LOWER(TRIM($1))', [item.codice]);
      if (ex.rows.length) { skipped++; continue; }

      // Trova sede per nome
      let sede_id = null;
      if (item.sede) {
        const sedeM = sedi.find(s => norm(s.nome) === norm(item.sede) || norm(s.citta) === norm(item.sede) || norm(s.nome).includes(norm(item.sede)));
        sede_id = sedeM?.id || null;
      }

      // Trova inquilino per nome
      let inquilino_id = null;
      if (item.inquilino) {
        const inqM = inquilini.find(i => norm(i.ragione_sociale) === norm(item.inquilino) || norm(i.ragione_sociale).includes(norm(item.inquilino)));
        inquilino_id = inqM?.id || null;
      }

      await client.query(
        'INSERT INTO subs (codice, ex_sub, sede_id, piano, inquilino_id, note) VALUES ($1,$2,$3,$4,$5,$6)',
        [item.codice.trim(), item.ex_sub||null, sede_id, item.piano||null, inquilino_id, item.note||null]
      );
      added++;
    }
    await client.query('COMMIT');
    res.json({ added, skipped, errors });
  } catch(e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});
  const { codice, ex_sub, sede_id, piano, inquilino_id, note } = req.body;
  const r = await pool.query(
    'UPDATE subs SET codice=$1,ex_sub=$2,sede_id=$3,piano=$4,inquilino_id=$5,note=$6 WHERE id=$7 RETURNING *',
    [codice, ex_sub||null, sede_id||null, piano||null, inquilino_id||null, note||null, req.params.id]
  );
  res.json(r.rows[0]);
});
app.delete('/api/subs/:id', authMiddleware, async (req, res) => {
  await pool.query('DELETE FROM subs WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// FORNITORI
// ═══════════════════════════════════════════════════════════
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
  const [totali, perSede, perAnno, ultimi, notifiche] = await Promise.all([
    pool.query(`SELECT COUNT(*) as num_interventi, COALESCE(SUM(prezzo),0) as totale_spese,
      (SELECT COUNT(*) FROM subs) as num_subs,
      (SELECT COUNT(*) FROM fornitori) as num_fornitori FROM interventi`),
    pool.query(`SELECT sd.nome as sede, COUNT(i.id) as num, COALESCE(SUM(i.prezzo),0) as totale
      FROM interventi i LEFT JOIN sedi sd ON i.sede_id=sd.id GROUP BY sd.nome ORDER BY totale DESC`),
    pool.query(`SELECT anno_fattura as anno, COUNT(*) as num, COALESCE(SUM(prezzo),0) as totale
      FROM interventi WHERE anno_fattura IS NOT NULL GROUP BY anno_fattura ORDER BY anno DESC LIMIT 5`),
    pool.query(`SELECT i.id, i.descrizione, i.prezzo, i.data_intervento, s.codice as sub, f.ragione_sociale as fornitore, sd.nome as sede
      FROM interventi i LEFT JOIN subs s ON i.sub_id=s.id LEFT JOIN fornitori f ON i.fornitore_id=f.id LEFT JOIN sedi sd ON i.sede_id=sd.id
      ORDER BY i.created_at DESC LIMIT 5`),
    pool.query(`SELECT i.id, i.descrizione, i.ha_notifica, s.codice as sub, sd.nome as sede
      FROM interventi i LEFT JOIN subs s ON i.sub_id=s.id LEFT JOIN sedi sd ON i.sede_id=sd.id
      WHERE i.ha_notifica=true ORDER BY i.updated_at DESC LIMIT 5`)
  ]);
  res.json({
    totali: totali.rows[0],
    perSede: perSede.rows,
    perAnno: perAnno.rows,
    ultimi: ultimi.rows,
    notifiche: notifiche.rows
  });
});

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
// IMPORT STORICO
// ═══════════════════════════════════════════════════════════
app.post('/api/interventi/import-storico', authMiddleware, async (req, res) => {
  const { rows } = req.body;
  const client = await pool.connect();
  let added = 0, errors = [];
  try {
    await client.query('BEGIN');
    const fornitori = (await client.query('SELECT * FROM fornitori')).rows;
    const inquilini = (await client.query('SELECT * FROM inquilini')).rows;
    const subs = (await client.query('SELECT * FROM subs')).rows;
    const sedi = (await client.query('SELECT * FROM sedi')).rows;
    const categorie = (await client.query('SELECT * FROM categorie')).rows;

    const norm = s => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');
    const findOrCreate = async (table, arr, nome) => {
      if (!nome) return null;
      const n = norm(nome);
      let found = arr.find(x => norm(x.ragione_sociale) === n) || arr.find(x => norm(x.ragione_sociale).includes(n) || n.includes(norm(x.ragione_sociale)));
      if (found) return found.id;
      const r = await client.query(`INSERT INTO ${table} (ragione_sociale) VALUES ($1) RETURNING *`, [nome.trim()]);
      arr.push(r.rows[0]);
      return r.rows[0].id;
    };
    const parseDate = d => {
      if (!d) return null;
      const s = String(d).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s.split('/').reverse().join('-');
      if (/^\d{2}\/\d{2}\/\d{2}$/.test(s)) { const [dd,mm,yy]=s.split('/'); return `20${yy}-${mm}-${dd}`; }
      return null;
    };

    for (const row of rows) {
      try {
        const subNorm = norm(row.sub_codice);
        const sub = subs.find(s => norm(s.codice) === subNorm || norm(s.ex_sub || '') === subNorm);
        const sede = row.location ? sedi.find(s => norm(s.nome).includes(norm(row.location)) || norm(row.location).includes(norm(s.nome))) : null;
        const fornitore_id = await findOrCreate('fornitori', fornitori, row.fornitore_nome);
        const inquilino_id = row.inquilino_nome ? await findOrCreate('inquilini', inquilini, row.inquilino_nome) : null;
        const { tags, hasNotifica } = generateTags(row.descrizione, row.note);
        const di = parseDate(row.data_intervento);
        const df = parseDate(row.data_fattura);
        const anno = di ? parseInt(di.split('-')[0]) : null;
        await client.query(`INSERT INTO interventi (sub_id,sede_id,fornitore_id,inquilino_id,protocollo,num_fattura,
          data_intervento,data_fattura,anno_fattura,prezzo,descrizione,note,tags,ha_notifica,created_by,updated_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15)`,
          [sub?.id||null, sede?.id||sub?.sede_id||null, fornitore_id, inquilino_id, row.protocollo||null, row.num_fattura||null,
           di, df, anno, parseFloat(row.prezzo)||null, row.descrizione||null, row.note||null, tags, hasNotifica, req.user.id]);
        if (sub?.id) await updateSaluteImmobile(sub.id);
        added++;
      } catch(e) { errors.push({ row: row.sub_codice, error: e.message }); }
    }
    await client.query('COMMIT');
    res.json({ added, errors });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

// ═══════════════════════════════════════════════════════════
// OCR FATTURA (AI)
// ═══════════════════════════════════════════════════════════
app.post('/api/ocr', authMiddleware, upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Nessun file' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'ANTHROPIC_API_KEY non configurata nelle variabili Railway' });

  // Determina media_type
  const mimeMap = {
    'image/jpeg': 'image/jpeg',
    'image/png': 'image/png',
    'image/gif': 'image/gif',
    'image/webp': 'image/webp',
    'application/pdf': 'application/pdf',
  };
  const mediaType = mimeMap[file.mimetype] || 'image/jpeg';
  const b64 = file.buffer.toString('base64');

  try {
    const content = mediaType === 'application/pdf'
      ? [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
          { type: 'text', text: 'Leggi questa fattura e restituisci SOLO un oggetto JSON valido (senza backtick, senza testo extra) con questi campi esatti: {"fornitore":"","piva_fornitore":"","num_fattura":"","data_fattura":"","data_intervento":"","protocollo":"","importo":"","descrizione":"","note":"","sub":"","sede":""}. Estrai tutti i dati presenti. Se un campo non è leggibile lascialo stringa vuota.' }
        ]
      : [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
          { type: 'text', text: 'Leggi questa fattura e restituisci SOLO un oggetto JSON valido (senza backtick, senza testo extra) con questi campi esatti: {"fornitore":"","piva_fornitore":"","num_fattura":"","data_fattura":"","data_intervento":"","protocollo":"","importo":"","descrizione":"","note":"","sub":"","sede":""}. Estrai tutti i dati presenti. Se un campo non è leggibile lascialo stringa vuota.' }
        ];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content }]
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    // Clean JSON
    const clean = text.replace(/```json|```/g, '').trim();
    let extracted = {};
    try { extracted = JSON.parse(clean); } catch(e) {
      // Try to extract JSON from text
      const match = clean.match(/\{[\s\S]*\}/);
      if (match) extracted = JSON.parse(match[0]);
    }
    res.json({ ok: true, data: extracted });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
// EXPORT EXCEL
// ═══════════════════════════════════════════════════════════
app.get('/api/export', authMiddleware, async (req, res) => {
  const r = await pool.query(`
    SELECT s.codice as sub, s.ex_sub, sd.nome as sede,
      inq.ragione_sociale as inquilino, f.ragione_sociale as fornitore,
      cat.nome as categoria, i.protocollo, i.data_intervento, i.data_fattura,
      i.anno_fattura, i.num_fattura, i.prezzo, i.descrizione, i.note,
      array_to_string(i.tags, ', ') as tags,
      uc.nome as inserito_da, i.created_at
    FROM interventi i
    LEFT JOIN subs s ON i.sub_id=s.id LEFT JOIN sedi sd ON i.sede_id=sd.id
    LEFT JOIN inquilini inq ON i.inquilino_id=inq.id LEFT JOIN fornitori f ON i.fornitore_id=f.id
    LEFT JOIN categorie cat ON i.categoria_id=cat.id LEFT JOIN users uc ON i.created_by=uc.id
    ORDER BY s.codice, i.data_intervento`);
  const rows = r.rows.map(row => ({
    'SUB': row.sub||'', 'Ex SUB': row.ex_sub||'', 'Sede': row.sede||'',
    'Inquilino': row.inquilino||'', 'Fornitore': row.fornitore||'', 'Categoria': row.categoria||'',
    'N° Protocollo': row.protocollo||'', 'Data Intervento': row.data_intervento||'',
    'Data Fattura': row.data_fattura||'', 'Anno': row.anno_fattura||'',
    'N° Fattura': row.num_fattura||'', 'Prezzo (€)': row.prezzo||'',
    'Descrizione': row.descrizione||'', 'Note': row.note||'',
    'Tags': row.tags||'', 'Inserito da': row.inserito_da||''
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Storico Interventi');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="storico_interventi_v3.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// ═══════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════
initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => console.log(`\n✅ Gestionale V3 avviato su http://localhost:${PORT}\n`));
}).catch(err => { console.error('Errore DB:', err.message); process.exit(1); });
