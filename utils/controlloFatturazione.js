'use strict';
// ═══════════════════════════════════════════════════════════════════════════
// Ogni "uscita" (bolletta, intervento con fornitore, manutenzione con costo,
// documento con importo) deve automaticamente entrare in un flusso di controllo
// unico verso la fatturazione — anche quando non è ancora deciso se vada
// rifatturata. Questo modulo centralizza la creazione/aggiornamento di quella
// riga di controllo, così nessuna sezione se ne può dimenticare.
//
// registraUscita() è idempotente: una UNIQUE(origine_tipo,origine_id) garantisce
// una sola riga di controllo per uscita, e i campi di "decisione" (rifatturabile,
// attribuzione, stato…) non vengono mai toccati da una chiamata successiva —
// solo i dati descrittivi (importo, fornitore, ecc.) restano allineati alla fonte.
// ═══════════════════════════════════════════════════════════════════════════

async function registraUscita(pool, { origine_tipo, origine_id, sub_id, sede_id, fornitore_nome, descrizione, importo, data_documento, protocollo, created_by }) {
  if (importo === undefined || importo === null || importo === '' || parseFloat(importo) === 0) return null; // niente da controllare se non c'è un importo
  try {
    const r = await pool.query(
      `INSERT INTO controllo_fatturazione
         (origine_tipo, origine_id, sub_id, sede_id, fornitore_nome, descrizione, importo, data_documento, protocollo, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (origine_tipo, origine_id) DO UPDATE SET
         sub_id=EXCLUDED.sub_id, sede_id=EXCLUDED.sede_id, fornitore_nome=EXCLUDED.fornitore_nome,
         descrizione=EXCLUDED.descrizione, importo=EXCLUDED.importo, data_documento=EXCLUDED.data_documento,
         protocollo=EXCLUDED.protocollo, updated_at=NOW()
       RETURNING *`,
      [origine_tipo, origine_id, sub_id || null, sede_id || null, fornitore_nome || null,
       descrizione || null, importo, data_documento || null, protocollo || null, created_by || null]
    );
    return r.rows[0];
  } catch (e) {
    console.error('⚠️ registraUscita fallita (non bloccante):', e.message);
    return null;
  }
}

async function rimuoviUscita(pool, origine_tipo, origine_id) {
  try { await pool.query('DELETE FROM controllo_fatturazione WHERE origine_tipo=$1 AND origine_id=$2', [origine_tipo, origine_id]); }
  catch (e) { console.error('⚠️ rimuoviUscita fallita (non bloccante):', e.message); }
}

module.exports = { registraUscita, rimuoviUscita };
