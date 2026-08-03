'use strict';
const express = require('express');
const cors = require('cors');
const path = require('path');
const { errorHandler } = require('./middleware/errors');

const app = express();

// ── MIDDLEWARE ──
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── ROUTES (mounted at root — route files keep full /api/... paths) ──
app.use('/', require('./routes/auth.routes'));
app.use('/', require('./routes/subs.routes'));
app.use('/', require('./routes/interventi.routes'));
app.use('/', require('./routes/documenti.routes'));
app.use('/', require('./routes/fornitori.routes'));
app.use('/', require('./routes/inquilini.routes'));
app.use('/', require('./routes/sedi.routes'));
app.use('/', require('./routes/manutenzioni.routes'));
app.use('/', require('./routes/bollette.routes'));
app.use('/', require('./routes/affitti.routes'));
app.use('/', require('./routes/contratti-affitto.routes'));
app.use('/', require('./routes/fatturazione.routes'));
app.use('/', require('./routes/analytics.routes'));
app.use('/', require('./routes/import.routes'));
app.use('/', require('./routes/riaccatastamento.routes'));
app.use('/', require('./routes/backup.routes'));
// Portale Inquilini disattivato (non più utilizzato) — disattivazione reversibile:
// nessun dato toccato, basta togliere il commento da questa riga per riattivarlo.
// app.use('/', require('./routes/portale.routes'));
app.use('/', require('./routes/clienti.routes'));
app.use('/', require('./routes/promemoria.routes'));
app.use('/', require('./routes/team.routes'));
app.use('/', require('./routes/solleciti.routes'));
app.use('/', require('./routes/smartzip.routes'));
app.use('/', require('./routes/aimail.routes'));
app.use('/', require('./routes/user-notifiche.routes'));
app.use('/', require('./routes/controllo-fatturazione.routes'));
app.use('/', require('./routes/spese-condominiali.routes'));

// ── 404 API ──
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint non trovato: ' + req.path });
});

// ── CRON ──
try {
  const { startPromemoriaEmailCron } = require('./cron/promemoria.cron');
  startPromemoriaEmailCron();
} catch(e) { console.warn('[app] Cron non avviato:', e.message); }
try {
  const { startBackupCron } = require('./cron/backup.cron');
  startBackupCron();
} catch(e) { console.warn('[app] Cron backup non avviato:', e.message); }

// ── SPA FALLBACK ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── ERROR HANDLER ──
app.use(errorHandler);

module.exports = app;
