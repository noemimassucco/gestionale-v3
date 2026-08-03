'use strict';
const rateLimit = require('express-rate-limit');

// Limita i tentativi di login (gestionale e portale) per contrastare il bruteforce.
// Condiviso tra i due login invece di duplicarlo in due file.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Troppi tentativi di accesso. Riprova tra qualche minuto.' },
});

module.exports = { loginLimiter };
