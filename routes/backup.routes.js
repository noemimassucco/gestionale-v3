'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const XLSX   = require('xlsx');
const { authMiddleware } = require('../middleware/auth');

// ── Admin-only middleware ────────────────────────────────────
function requireAdmin(req, res, next) {
  if (req.user?.ruolo !== 'admin') {
    return res.status(403).json({ error: 'Richiede ruolo admin' });
  }
  next();
}

// ═══════════════════════════════════════════════════════════
// GET /api/export — Excel con interventi + subs
// ═══════════════════════════════════════════════════════════
router.get('/api/export', authMiddleware, async (req, res) => {
  try {
    const [interventi, subs] = await Promise.all([
      pool.query(`
        SELECT
          i.id, i.protocollo, i.num_fattura,
          i.data_intervento, i.data_fattura, i.anno_fattura,
          i.prezzo, i.descrizione, i.note,
          s.codice  AS sub_codice,
          sd.nome   AS sede,
          f.ragione_sociale AS fornitore,
          cat.nome  AS categoria,
          inq.ragione_sociale AS inquilino
        FROM interventi i
        LEFT JOIN subs      s   ON i.sub_id       = s.id
        LEFT JOIN sedi      sd  ON i.sede_id       = sd.id
        LEFT JOIN fornitori f   ON i.fornitore_id  = f.id
        LEFT JOIN categorie cat ON i.categoria_id  = cat.id
        LEFT JOIN inquilini inq ON i.inquilino_id  = inq.id
        ORDER BY COALESCE(i.data_intervento, i.created_at) DESC
      `),
      pool.query(`
        SELECT
          s.id, s.codice, s.ex_sub, s.piano,
          s.foglio, s.particella, s.subalterno,
          s.categoria_cat, s.mq_commerciali, s.mq_calpestabili,
          s.rendita, s.stato_occupazione, s.classe_energetica,
          s.anno_costruzione, s.canone_annuo, s.tipo_contratto,
          s.data_inizio_contratto, s.millesimi, s.note,
          sd.nome   AS sede,
          inq.ragione_sociale AS inquilino
        FROM subs s
        LEFT JOIN sedi      sd  ON s.sede_id       = sd.id
        LEFT JOIN inquilini inq ON s.inquilino_id  = inq.id
        ORDER BY sd.nome, s.codice
      `),
    ]);

    const wb = XLSX.utils.book_new();

    // ── Foglio 1: Interventi ────────────────────────────────
    const intHeaders = [
      'ID','Protocollo','N° Fattura','Data Intervento','Data Fattura',
      'Anno','Importo €','Descrizione','Note','SUB','Sede',
      'Fornitore','Categoria','Inquilino',
    ];
    const intRows = interventi.rows.map(r => [
      r.id, r.protocollo||'', r.num_fattura||'',
      r.data_intervento ? r.data_intervento.toISOString().split('T')[0] : '',
      r.data_fattura    ? r.data_fattura.toISOString().split('T')[0]    : '',
      r.anno_fattura||'',
      r.prezzo ? parseFloat(r.prezzo) : '',
      r.descrizione||'', r.note||'',
      r.sub_codice||'', r.sede||'', r.fornitore||'',
      r.categoria||'', r.inquilino||'',
    ]);

    const wsInt = XLSX.utils.aoa_to_sheet([intHeaders, ...intRows]);
    _styleSheet(wsInt, intHeaders.length, intRows.length);
    XLSX.utils.book_append_sheet(wb, wsInt, '📋 Interventi');

    // ── Foglio 2: SUB ───────────────────────────────────────
    const subHeaders = [
      'ID','Codice','Ex-SUB','Sede','Piano',
      'Foglio','Particella','Sub.','Categoria Cat.','MQ Commerciali',
      'MQ Calpestabili','Rendita €','Stato','Classe Energetica',
      'Anno Costr.','Canone Annuo €','Tipo Contratto','Inizio Contratto',
      'Millesimi','Inquilino','Note',
    ];
    const subRows = subs.rows.map(r => [
      r.id, r.codice, r.ex_sub||'', r.sede||'', r.piano||'',
      r.foglio||'', r.particella||'', r.subalterno||'',
      r.categoria_cat||'',
      r.mq_commerciali ? parseFloat(r.mq_commerciali) : '',
      r.mq_calpestabili ? parseFloat(r.mq_calpestabili) : '',
      r.rendita ? parseFloat(r.rendita) : '',
      r.stato_occupazione||'', r.classe_energetica||'',
      r.anno_costruzione||'',
      r.canone_annuo ? parseFloat(r.canone_annuo) : '',
      r.tipo_contratto||'',
      r.data_inizio_contratto ? r.data_inizio_contratto.toISOString().split('T')[0] : '',
      r.millesimi ? parseFloat(r.millesimi) : '',
      r.inquilino||'', r.note||'',
    ]);

    const wsSub = XLSX.utils.aoa_to_sheet([subHeaders, ...subRows]);
    _styleSheet(wsSub, subHeaders.length, subRows.length);
    XLSX.utils.book_append_sheet(wb, wsSub, '🏢 SUB');

    // ── Scrivi e invia ──────────────────────────────────────
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const date = new Date().toISOString().slice(0,10);
    res.setHeader('Content-Disposition', `attachment; filename="gestionale_export_${date}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);

  } catch(e) {
    console.error('Export error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Helper: style header row + column widths
function _styleSheet(ws, nCols, nRows) {
  // Column widths
  ws['!cols'] = Array(nCols).fill({ wch: 18 });
  ws['!cols'][0] = { wch: 6 };   // ID

  // Freeze header row
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  // Style header cells (row 0)
  for (let c = 0; c < nCols; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (!ws[addr]) continue;
    ws[addr].s = {
      fill: { patternType: 'solid', fgColor: { rgb: '1E3A5F' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
      alignment: { horizontal: 'center', vertical: 'center' },
    };
  }
}

// ═══════════════════════════════════════════════════════════
// GET /api/backup — JSON completo di tutte le tabelle
// ═══════════════════════════════════════════════════════════
const BACKUP_TABLES = [
  'sedi', 'categorie', 'inquilini', 'fornitori',
  'subs', 'interventi', 'allegati', 'contratti', 'sub_storia',
  'documenti', 'manutenzioni', 'bollette', 'ticket',
  'pagamenti_affitto', 'ordini_fatturazione',
  'riaccatastamenti', 'millesimi_tabelle', 'millesimi_valori',
  'settings',
];

router.get('/api/backup', authMiddleware, async (req, res) => {
  try {
    const tables = {};
    let totalRows = 0;

    for (const table of BACKUP_TABLES) {
      try {
        const r = await pool.query(`SELECT * FROM ${table} ORDER BY id`);
        tables[table] = r.rows;
        totalRows += r.rows.length;
      } catch(e) {
        // Table might not exist yet (new migrations)
        tables[table] = [];
      }
    }

    const backup = {
      exported: new Date().toISOString(),
      version: '1.0',
      totalRows,
      tables,
    };

    const date = new Date().toISOString().slice(0,10);
    res.setHeader('Content-Disposition', `attachment; filename="gestionale_backup_${date}.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(backup);

  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
// POST /api/restore — Ripristino completo da JSON backup
// ═══════════════════════════════════════════════════════════

// Tabelle in ordine di RESTORE (dipendenze FK: padri prima dei figli)
const RESTORE_ORDER = [
  'settings',
  'sedi',
  'categorie',
  'inquilini',
  'fornitori',
  'subs',
  'interventi',
  'allegati',
  'contratti',
  'sub_storia',
  'documenti',
  'manutenzioni',
  'bollette',
  'ticket',
  'pagamenti_affitto',
  'ordini_fatturazione',
  'millesimi_tabelle',
  'millesimi_valori',
  'riaccatastamenti',
];

// Tabelle in ordine di TRUNCATE (figli prima dei padri — inverso)
const TRUNCATE_ORDER = [...RESTORE_ORDER].reverse();

router.post('/api/restore', authMiddleware, requireAdmin, async (req, res) => {
  const { tables, version, exported: exportedAt } = req.body;

  if (!tables || typeof tables !== 'object') {
    return res.status(400).json({ error: 'Payload non valido: manca tables{}' });
  }

  const client = await pool.connect();
  const counts = {};
  const errors = [];

  try {
    await client.query('BEGIN');

    // ── 1. TRUNCATE nell'ordine giusto (figli prima dei padri) ──
    for (const table of TRUNCATE_ORDER) {
      if (tables[table] === undefined) continue;
      try {
        await client.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);
      } catch(e) {
        // Ignore if table doesn't exist
      }
    }

    // ── 2. INSERT nell'ordine giusto (padri prima dei figli) ──
    for (const table of RESTORE_ORDER) {
      const rows = tables[table];
      if (!rows?.length) {
        counts[table] = 0;
        continue;
      }

      let inserted = 0;
      const cols = Object.keys(rows[0]);
      // Filter out computed/view columns if present
      const safeCols = cols.filter(c => !['sede_nome','sub_codice','fornitore_nome'].includes(c));

      for (const row of rows) {
        const vals = safeCols.map(col => {
          const v = row[col];
          return v === '' ? null : v;
        });
        const placeholders = safeCols.map((_, i) => `$${i + 1}`).join(',');
        const colList = safeCols.map(c => `"${c}"`).join(',');

        try {
          await client.query(
            `INSERT INTO ${table} (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
            vals
          );
          inserted++;
        } catch(e) {
          errors.push(`${table}[${row.id}]: ${e.message.slice(0,80)}`);
        }
      }

      // Reset sequence to max id + 1
      try {
        await client.query(
          `SELECT setval(pg_get_serial_sequence('${table}','id'), COALESCE(MAX(id),0)+1, false) FROM ${table}`
        );
      } catch(_) {}

      counts[table] = inserted;
    }

    await client.query('COMMIT');

    const totalRestored = Object.values(counts).reduce((a, b) => a + b, 0);
    res.json({
      ok: true,
      message: `Ripristino completato: ${totalRestored} righe in ${Object.keys(counts).length} tabelle`,
      exportedAt,
      counts,
      errors: errors.slice(0, 20), // cap at 20
    });

  } catch(e) {
    await client.query('ROLLBACK');
    console.error('Restore failed:', e.message);
    res.status(500).json({ error: 'Restore fallito: ' + e.message });
  } finally {
    client.release();
  }
});

module.exports = router;
