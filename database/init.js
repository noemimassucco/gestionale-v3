'use strict';
const pool   = require('../config/db');
const bcrypt = require('bcryptjs');

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
      CREATE TABLE IF NOT EXISTS team_messaggi (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id), testo TEXT NOT NULL, created_at TIMESTAMP DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS settings (cfg_key VARCHAR(100) PRIMARY KEY, value TEXT, updated_by INTEGER, updated_at TIMESTAMP DEFAULT NOW());
    `);

    // Migrazioni puntuali
    try { await client.query(`ALTER TABLE ticket ADD COLUMN IF NOT EXISTS note TEXT`); } catch(e) {}

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
      ['millesimi', 'DECIMAL(10,2)'],
      ['spesa_cond_totale', 'DECIMAL(12,2)'],
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


    // ── Migrazione: colonne clienti su inquilini ────────────
    for (const col of [
      ['is_lead',                    'BOOLEAN DEFAULT false'],
      ['lead_data_primo_contatto',   'DATE'],
      ['lead_note',                  'TEXT'],
      ['stato_cliente',              "VARCHAR(20) DEFAULT NULL"],
    ]) {
      try { await client.query(`ALTER TABLE inquilini ADD COLUMN IF NOT EXISTS ${col[0]} ${col[1]}`); } catch(e) {}
    }



    // ── Migrazione P18-20: stato SUB ────────────────────────
    for (const [col, def] of [
      ['stato_sub',           "VARCHAR(20) DEFAULT 'attivo'"],
      ['data_cambio_stato',   'DATE'],
      ['sub_destinazione_id', 'INTEGER'],
    ]) {
      try { await client.query(`ALTER TABLE subs ADD COLUMN IF NOT EXISTS ${col} ${def}`); } catch(e) {}
    }
    // FK sub_destinazione_id → subs(id) (aggiunta separatamente perché richiede la tabella già pronta)
    try {
      await client.query(`ALTER TABLE subs ADD CONSTRAINT fk_sub_dest
        FOREIGN KEY (sub_destinazione_id) REFERENCES subs(id) ON DELETE SET NULL`);
    } catch(e) {}


    // ── Migrazione P16 RIVISTO: colonne lead estese ─────────
    const _p16cols = [
      ['nome',                       'VARCHAR(100)'],
      ['cognome',                    'VARCHAR(100)'],
      ['lead_stato_pipeline',        "VARCHAR(40) DEFAULT 'nuovo'"],
      ['lead_fonte',                 'VARCHAR(50)'],
      ['lead_owner_user_id',         'INTEGER'],
      ['lead_motivo_perdita',        'TEXT'],
      ['tel_alt',                    'VARCHAR(50)'],
      ['note_lead',                  'TEXT'],
      ['ricerca_tipologia',          'VARCHAR(30)'],
      ['ricerca_categoria',          'VARCHAR(30)'],
      ['ricerca_zona',               'VARCHAR(200)'],
      ['ricerca_mq_min',             'INTEGER'],
      ['ricerca_mq_max',             'INTEGER'],
      ['ricerca_stanze',             'INTEGER'],
      ['ricerca_budget_max',         'DECIMAL(10,2)'],
      ['ricerca_disponibilita_da',   'DATE'],
      ['ricerca_sub_interesse_id',   'INTEGER'],
    ];
    for (const [col, def] of _p16cols) {
      try { await client.query(`ALTER TABLE inquilini ADD COLUMN IF NOT EXISTS ${col} ${def}`); } catch(e) {}
    }
    // FK lead_owner e ricerca_sub
    try { await client.query(`ALTER TABLE inquilini ADD CONSTRAINT fk_lead_owner
      FOREIGN KEY (lead_owner_user_id) REFERENCES users(id) ON DELETE SET NULL`); } catch(e) {}
    try { await client.query(`ALTER TABLE inquilini ADD CONSTRAINT fk_ricerca_sub
      FOREIGN KEY (ricerca_sub_interesse_id) REFERENCES subs(id) ON DELETE SET NULL`); } catch(e) {}

    // ── Tabella promemoria (P17) — CREATE PRIMA dell'ALTER ───
    await client.query(`
      CREATE TABLE IF NOT EXISTS promemoria (
        id                SERIAL PRIMARY KEY,
        user_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
        titolo            VARCHAR(200) NOT NULL,
        descrizione       TEXT,
        data_evento       DATE NOT NULL,
        ora_evento        TIME,
        entita_tipo       VARCHAR(30),
        entita_id         INTEGER,
        alert_giorni_prima INTEGER[],
        alert_ore_prima   INTEGER[],
        completato        BOOLEAN DEFAULT false,
        created_at        TIMESTAMP DEFAULT NOW()
      )
    `).catch(()=>{});
    await client.query(`CREATE INDEX IF NOT EXISTS idx_promemoria_data ON promemoria(data_evento)`).catch(()=>{});
    await client.query(`CREATE INDEX IF NOT EXISTS idx_promemoria_user ON promemoria(user_id)`).catch(()=>{});

    // ── Aggiorna tabella promemoria (aggiunte P16r) ──────────
    try { await client.query(`ALTER TABLE promemoria ADD COLUMN IF NOT EXISTS tipo_azione VARCHAR(30)`); } catch(e) {}
    try { await client.query(`ALTER TABLE promemoria ADD COLUMN IF NOT EXISTS completato_at TIMESTAMP`); } catch(e) {}
    try { await client.query(`CREATE INDEX IF NOT EXISTS idx_promemoria_entita ON promemoria(entita_tipo, entita_id)`); } catch(e) {}


    // ── Migrazione Portale Inquilino ────────────────────────
    try { await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS inquilino_id INTEGER REFERENCES inquilini(id) ON DELETE SET NULL`); } catch(e) {}
    // Assicura ruolo 'inquilino' sia valido (nessun ENUM, solo VARCHAR — già OK)

    // Step 4: Admin default
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@gestionale.it';
    const adminPwd = process.env.ADMIN_PASSWORD || 'Admin2024!';
    const existing = await client.query('SELECT id FROM users WHERE email=$1', [adminEmail]);
    if (!existing.rows.length) {
      const hash = await bcrypt.hash(adminPwd, 10);
      await client.query("INSERT INTO users (email,password_hash,nome,ruolo) VALUES ($1,$2,'Amministratore','admin')", [adminEmail, hash]);
    }
    // Step 4b: Tabella Schema di Fatturazione
    await client.query(`
      CREATE TABLE IF NOT EXISTS ordini_fatturazione (
        id SERIAL PRIMARY KEY,
        sub_id INTEGER REFERENCES subs(id),
        inquilino_id INTEGER REFERENCES inquilini(id),
        tipo_servizio VARCHAR(100) NOT NULL DEFAULT 'servizio_vario',
        nome_servizio VARCHAR(200),
        descrizione TEXT,
        importo DECIMAL(12,2),
        periodicita VARCHAR(30) DEFAULT 'mensile',
        data_inizio DATE,
        data_fine DATE,
        stato VARCHAR(30) DEFAULT 'attivo',
        mese_riferimento INTEGER,
        anno_riferimento INTEGER,
        numero_fattura VARCHAR(100),
        data_fatturazione DATE,
        data_pagamento DATE,
        stato_pagamento VARCHAR(30) DEFAULT 'non_pagato',
        flag_contabilizzato BOOLEAN DEFAULT FALSE,
        importo_pagato DECIMAL(12,2),
        note_contabili TEXT,
        note TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    // Colonne ISTAT sui SUB
    await client.query(`
      ALTER TABLE subs ADD COLUMN IF NOT EXISTS istat_periodicita VARCHAR(30) DEFAULT '12_mesi';
      ALTER TABLE subs ADD COLUMN IF NOT EXISTS istat_percentuale DECIMAL(5,2);
      ALTER TABLE subs ADD COLUMN IF NOT EXISTS istat_data_ultima_revisione DATE;
      ALTER TABLE subs ADD COLUMN IF NOT EXISTS istat_data_prossima_revisione DATE;
      ALTER TABLE subs ADD COLUMN IF NOT EXISTS istat_tipo VARCHAR(30) DEFAULT 'automatico';
      ALTER TABLE subs ADD COLUMN IF NOT EXISTS istat_note TEXT;
    `).catch(()=>{});

    // updated_at su subs (era mancante dal CREATE TABLE originale)
    await client.query(`
      ALTER TABLE subs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
    `).catch(()=>{});

    // Step 4c: Riaccatastamenti
    await client.query(`
      CREATE TABLE IF NOT EXISTS riaccatastamenti (
        id SERIAL PRIMARY KEY,
        sub_id INTEGER REFERENCES subs(id) ON DELETE CASCADE,
        foglio_prec VARCHAR(50), particella_prec VARCHAR(50), subalterno_prec VARCHAR(50),
        foglio_nuovo VARCHAR(50), particella_nuova VARCHAR(50), subalterno_nuovo VARCHAR(50),
        data_operazione DATE,
        protocollo_catastale VARCHAR(100),
        motivazione TEXT,
        note TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS millesimi_tabelle (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(100) NOT NULL UNIQUE,
        descrizione TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS millesimi_valori (
        id SERIAL PRIMARY KEY,
        sub_id INTEGER REFERENCES subs(id) ON DELETE CASCADE,
        tabella_id INTEGER REFERENCES millesimi_tabelle(id) ON DELETE CASCADE,
        valore DECIMAL(10,4) DEFAULT 0,
        note TEXT,
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(sub_id, tabella_id)
      );
    `);

    // Colonne millesimi su subs
    await client.query(`
      ALTER TABLE subs ADD COLUMN IF NOT EXISTS millesimi DECIMAL(10,4);
    `).catch(()=>{});

    // Tabella millesimale default
    await client.query(`
      INSERT INTO millesimi_tabelle (nome, descrizione)
      VALUES ('Millesimi di proprietà','Tabella millesimale generale per ripartizione spese')
      ON CONFLICT (nome) DO NOTHING;
    `).catch(()=>{});

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

module.exports = { initDB };
