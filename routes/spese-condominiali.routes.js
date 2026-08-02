'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const { registraUscita, rimuoviUscita } = require('../utils/controlloFatturazione');

// ═══════════════════════════════════════════════════════════
// SPESE CONDOMINIALI — una spesa complessiva per sede/condominio, ripartita
// automaticamente per SUB in base ai millesimi (tabella millesimale scelta).
// Ogni quota calcolata entra come una normale "uscita" nel flusso unico di
// Controllo Fatturazione (origine_tipo='ripartizione_condominiale').
// ═══════════════════════════════════════════════════════════

// Elenco spese condominiali importate, con riepilogo ripartizione
router.get('/api/spese-condominiali', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT sc.*, sd.nome as sede_nome, mt.nome as tabella_nome,
        (SELECT COUNT(*) FROM spese_condominiali_ripartizioni WHERE spesa_condominiale_id=sc.id) as num_ripartizioni
      FROM spese_condominiali sc
      LEFT JOIN sedi sd ON sc.sede_id=sd.id
      LEFT JOIN millesimi_tabelle mt ON sc.tabella_millesimale_id=mt.id
      ORDER BY sc.data_spesa DESC NULLS LAST, sc.id DESC`);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Dettaglio con ripartizione per SUB
router.get('/api/spese-condominiali/:id', authMiddleware, async (req, res) => {
  try {
    const sc = await pool.query(`
      SELECT sc.*, sd.nome as sede_nome, mt.nome as tabella_nome
      FROM spese_condominiali sc
      LEFT JOIN sedi sd ON sc.sede_id=sd.id
      LEFT JOIN millesimi_tabelle mt ON sc.tabella_millesimale_id=mt.id
      WHERE sc.id=$1`, [req.params.id]);
    if (!sc.rows.length) return res.status(404).json({ error: 'Non trovata' });
    const rip = await pool.query(`
      SELECT r.*, s.codice as sub_codice
      FROM spese_condominiali_ripartizioni r
      LEFT JOIN subs s ON r.sub_id=s.id
      WHERE r.spesa_condominiale_id=$1
      ORDER BY s.codice`, [req.params.id]);
    res.json({ ...sc.rows[0], ripartizioni: rip.rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Import massivo: ogni riga è una spesa condominiale complessiva, che viene
// automaticamente ripartita fra tutti i SUB della sede in base ai millesimi correnti.
router.post('/api/spese-condominiali/import-bulk', authMiddleware, async (req, res) => {
  const { rows } = req.body;
  if (!rows?.length) return res.json({ added: 0, totale_ripartizioni: 0, warnings: [], errors: [] });

  const client = await pool.connect();
  let added = 0, totaleRipartizioni = 0;
  const warnings = [], errors = [];
  try {
    const [sedi, tabelle] = await Promise.all([
      client.query('SELECT id, nome FROM sedi').then(r => r.rows),
      client.query('SELECT id, nome FROM millesimi_tabelle ORDER BY id').then(r => r.rows),
    ]);
    const normalize = s => (s || '').toString().toLowerCase().trim();
    const findSede = nome => sedi.find(s => normalize(s.nome) === normalize(nome)) ||
      sedi.find(s => normalize(s.nome).includes(normalize(nome)) || normalize(nome).includes(normalize(s.nome)));
    const findTabella = nome => {
      if (nome) {
        const t = tabelle.find(t => normalize(t.nome) === normalize(nome)) ||
          tabelle.find(t => normalize(t.nome).includes(normalize(nome)) || normalize(nome).includes(normalize(t.nome)));
        if (t) return t;
      }
      return tabelle.find(t => normalize(t.nome).includes('proprieta')) || tabelle[0] || null;
    };

    for (const [idx, row] of rows.entries()) {
      try {
        await client.query('BEGIN');
        const sede = findSede(row.sede);
        if (!sede) { throw new Error(`Sede "${row.sede}" non trovata`); }
        const tabella = findTabella(row.tabella_millesimale);
        if (!tabella) { throw new Error('Nessuna tabella millesimale disponibile — creane una prima di importare'); }
        const importoTotale = parseFloat(row.importo_totale);
        if (!importoTotale || isNaN(importoTotale)) { throw new Error('Importo totale mancante o non valido'); }

        const scr = await client.query(
          `INSERT INTO spese_condominiali (sede_id, tabella_millesimale_id, data_spesa, descrizione, fornitore_nome, protocollo, importo_totale, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [sede.id, tabella.id, row.data_spesa || null, row.descrizione || null, row.fornitore_nome || null,
           row.protocollo || null, importoTotale, req.user.id]);
        const spesaId = scr.rows[0].id;

        // Millesimi correnti (ultimo valore con data_validita <= oggi) per ogni SUB della sede
        const valori = await client.query(`
          SELECT DISTINCT ON (mv.sub_id) mv.sub_id, mv.valore
          FROM millesimi_valori mv
          JOIN subs s ON mv.sub_id=s.id
          WHERE mv.tabella_id=$1 AND s.sede_id=$2 AND mv.data_validita <= CURRENT_DATE
          ORDER BY mv.sub_id, mv.data_validita DESC, mv.updated_at DESC, mv.id DESC`,
          [tabella.id, sede.id]);
        const tuttiSub = await client.query('SELECT id, codice FROM subs WHERE sede_id=$1', [sede.id]);

        let importoRipartito = 0, subSenzaMillesimi = 0;
        for (const sub of tuttiSub.rows) {
          const v = valori.rows.find(x => x.sub_id === sub.id);
          if (!v || !parseFloat(v.valore)) { subSenzaMillesimi++; continue; }
          const millesimo = parseFloat(v.valore);
          const quota = Math.round(importoTotale * millesimo / 1000 * 100) / 100;
          importoRipartito += quota;
          const ripR = await client.query(
            `INSERT INTO spese_condominiali_ripartizioni (spesa_condominiale_id, sub_id, millesimo, quota)
             VALUES ($1,$2,$3,$4) ON CONFLICT (spesa_condominiale_id, sub_id) DO UPDATE SET millesimo=$3, quota=$4
             RETURNING id`,
            [spesaId, sub.id, millesimo, quota]);
          await registraUscita(client, {
            origine_tipo: 'ripartizione_condominiale', origine_id: ripR.rows[0].id,
            sub_id: sub.id, sede_id: sede.id, fornitore_nome: row.fornitore_nome || null,
            descrizione: `Quota spesa condominiale: ${row.descrizione || '—'} (${millesimo}‰ su ${tabella.nome})`,
            importo: quota, data_documento: row.data_spesa || null, protocollo: row.protocollo || null,
            created_by: req.user.id,
          });
          totaleRipartizioni++;
        }

        await client.query(
          'UPDATE spese_condominiali SET importo_ripartito=$1, sub_senza_millesimi=$2 WHERE id=$3',
          [importoRipartito, subSenzaMillesimi, spesaId]);

        await client.query('COMMIT');
        added++;
        if (subSenzaMillesimi > 0) {
          warnings.push({
            riga: idx + 1, descrizione: row.descrizione || '',
            messaggio: `${subSenzaMillesimi} SUB di ${sede.nome} senza millesimi impostati — quota non ripartita per quei SUB (€ ${(importoTotale - importoRipartito).toFixed(2)} non attribuiti)`,
          });
        }
      } catch (e) {
        await client.query('ROLLBACK');
        errors.push({ riga: idx + 1, error: e.message });
      }
    }

    res.json({ added, totale_ripartizioni: totaleRipartizioni, warnings, errors });
  } catch(e) {
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// Elimina una spesa condominiale: rimuove anche tutte le quote generate e le relative
// righe dal Controllo Fatturazione (compresi gli eventuali ordini di fatturazione collegati,
// se non ancora lavorati dalla contabile — vedi rimuoviUscita).
router.delete('/api/spese-condominiali/:id', authMiddleware, async (req, res) => {
  try {
    const rip = await pool.query('SELECT id FROM spese_condominiali_ripartizioni WHERE spesa_condominiale_id=$1', [req.params.id]);
    for (const r of rip.rows) {
      await rimuoviUscita(pool, 'ripartizione_condominiale', r.id);
    }
    await pool.query('DELETE FROM spese_condominiali WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
