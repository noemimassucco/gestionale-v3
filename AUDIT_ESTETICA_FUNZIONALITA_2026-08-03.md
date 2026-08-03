# Audit estetica + funzionalità superflue — 03/08/2026

## ✅ Deciso e fatto (aggiornamento)

Dopo l'analisi qui sotto hai deciso così, ed è stato implementato e testato:

- **Chat AI** → rimossa completamente (frontend + backend + pulsante fluttuante).
- **Chat Team** → mantenuta invariata.
- **Ticket/Segnalazioni** → rimosso completamente, incluso dal portale inquilino (tab "Segnalazioni", KPI in dashboard, endpoint API). I dati storici restano nel database, solo la funzionalità è stata tolta.
- **Lead** → lasciato così com'è, nessuna modifica.
- **Notifiche / Per te** → non toccate, nessuna modifica.
- **Estetica** (doppio `:root`, colori hardcoded, contrasto, ecc.) → non ancora toccata, resta da valutare a parte quando vuoi.

Testato in locale prima di consegnare: login, SUB/bollette/interventi/manutenzioni/chat team tutti funzionanti; `/api/ticket` e `/api/chat` ora rispondono 404 come previsto; bulk-delete rifiuta correttamente "ticket" come tabella non più consentita; portale inquilino carica senza la tab segnalazioni.

---

## PARTE 1 — Estetica (index.html + portale.html)

File analizzati: il blocco `<style>` di `public/index.html` (righe 17-835) e `public/portale.html`.

### 🔴 Da sistemare (alto impatto, rischio basso)

1. **Doppio `:root{}` con palette diverse.** A riga 21 c'è la dichiarazione principale delle variabili colore (`--bg`, `--bg2`, `--card`, `--border`...), ma a **riga 672** c'è un *secondo* `:root{}` che le ridefinisce con valori diversi. Il secondo vince e sovrascrive il primo — quindi metà del file "pensa" di usare una palette che in realtà non è quella attiva. Retaggio di ~6 restyling successivi mai ripuliti (si vede anche in classi ridefinite più volte: `.tab-btn`, `.ctx-menu`, `.notif-item`, `.sel-check`).
2. **~54 colori scritti a mano invece delle variabili di progetto.** Es. `#dcfce7`, `#fef3c7`, `#fee2e2`, `#0f172a` (stile Tailwind) sparsi nell'HTML e anche in `public/js/spese-condominiali.js`, invece di usare `--success`, `--warning`, `--danger` già definite. Risultato: se un giorno cambi il colore "successo" dell'app, metà delle etichette verdi non si aggiornano.
3. **Contrasto insufficiente.** `--muted-2` (`#a2a7ad`) ha un contrasto di circa 2.4:1 su sfondo chiaro — sotto la soglia minima di leggibilità (WCAG AA richiede 4.5:1). È il colore usato per molte etichette in maiuscolo, quindi capita spesso di doverle "strizzare gli occhi" per leggerle.

### 🟡 Da valutare (impatto medio)

4. **`portale.html` sembra un'altra app.** Font, palette e identità visiva sono completamente diversi da `index.html` (verde salvia invece della sidebar scura+terracotta, niente dei font Fraunces/Instrument Sans usati nell'app principale). Se gli inquilini lo usano, l'incoerenza si nota.
5. Classi `.badge-success/.badge-warning/.badge-danger/.badge-info` **definite ma mai usate** — CSS morto, si può eliminare senza rischio.
6. Bottoni "chiudi" (✕) con **3 stili leggermente diversi** in punti diversi dell'app.
7. Naming fuorviante: `--gold` e `--teal` hanno **lo stesso valore** — una delle due variabili è ridondante.

### 🟢 Cosa è già buono (non toccare)
Gestione mobile/responsive (sidebar a scomparsa, modali a comparsa dal basso, font 16px che evita lo zoom automatico di iOS), le micro-animazioni hover/active, gli stati vuoti ("nessun elemento"), la struttura di base dei modali.

---

## PARTE 2 — Funzionalità potenzialmente superflue

Analizzati tutti i moduli "accessori" (non le funzioni core come SUB/bollette/interventi/fatturazione, quelle restano intoccate).

| Modulo | Cosa fa davvero | Valutazione |
|---|---|---|
| **chat.js** ("Chat AI" in sidebar) | Non è vera IA: `/api/chat` fa solo pattern-matching su parole chiave italiane ("idraul", "urgente", "scadenz"...) e lancia query SQL fisse. Ridondante con i filtri già presenti in Interventi/Documenti e col comando rapido (Ctrl+K). | **Da rimuovere** — codice da mantenere senza reale valore aggiunto |
| **teamchat.js** ("Chat Team", con @menzioni) | Chat interna multi-utente con ruoli admin/operatore. In un gestionale usato da una persona sola non c'è nessun "team" con cui parlare. | **Da rimuovere** — la funzionalità meno giustificabile trovata |
| **lead_ui.js** (tab "Lead" dentro Inquilini) | Pipeline commerciale completa da CRM immobiliare: fonte, budget, appuntamenti, stati nuovo→contattato→trattativa→convertito. Pensata per un'agenzia con marketing attivo, non per chi affitta i propri immobili. | **Da semplificare o rimuovere** — al massimo serve un campo "interessato a questo SUB", non un'intera pipeline |
| **perte.js** (campanella "Per te" in topbar) | Pannello di notifiche personali (menzioni, eventi account) + promemoria del giorno, sovrapposto alla sezione "Notifiche" già esistente. Se si toglie la Chat Team, perde gran parte della sua ragion d'essere (niente più menzioni da ricevere). | **Da semplificare/unire** al campanello Notifiche generale |
| **cmdk.js** (Ctrl+K, comando rapido) | Cerca SUB/clienti/fornitori/sezioni e offre azioni rapide (nuovo SUB, bolletta, pagamento...). Ben integrato e completo. | **Da mantenere** — tra gli "accessori" è quello più maturo e utile |
| **analytics.js** (nome fuorviante) | Non è un modulo di statistiche: è il tracking dei **pagamenti affitto** (sezione "Affitti"), con aging crediti e solleciti email. Funzione core, solo il nome file è infelice (andrebbe chiamato `affitti.js`). | **Mantenere** — nessuna sovrapposizione reale con `ana.js` (anagrafiche), nomi solo simili |
| **calendar.js**, **notifications.js** | Calendario eventi/scadenze e centro notifiche di sistema. Ben collegati e usati operativamente. | **Mantenere** |
| **ticket.js** | Segnalazioni collegate al portale inquilini self-service. | **Mantenere se usi davvero il portale inquilini**, altrimenti si può fondere con Manutenzioni |
| **riaccatastamento.js** | Già segnalato nell'audit precedente: due flussi paralleli (modifica in-place / nuovo SUB) — da tua valutazione se servono entrambi | *(non riapprofondito qui)* |

### Proposta pratica
Se confermi, il pacchetto "**rimuovi Chat AI + Chat Team + semplifica Per te**" è quello a maggior beneficio/minor rischio: elimina codice morto/inutile senza toccare nessun dato economico o storico, e il campanello Notifiche esistente assorbe già la funzione utile di "Per te". Lead invece lo lascerei a te: dipende se in futuro vuoi tracciare candidati inquilini o no.

---

## Non toccato in questo giro
Le due falle di sicurezza (privilege escalation) restano volutamente da parte, come da tua indicazione.
