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
app.use('/', require('./routes/ticket.routes'));
app.use('/', require('./routes/affitti.routes'));
app.use('/', require('./routes/fatturazione.routes'));
app.use('/', require('./routes/analytics.routes'));
app.use('/', require('./routes/import.routes'));
app.use('/', require('./routes/chat.routes'));

// ── 404 API ──
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint non trovato: ' + req.path });
});

// ── SPA FALLBACK ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── ERROR HANDLER ──
app.use(errorHandler);

module.exports = app;
