'use strict';
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./auth');

/**
 * Middleware portale inquilino.
 * Verifica JWT e che ruolo === 'inquilino'.
 * Aggiunge req.user.inquilino_id a ogni richiesta.
 */
function requireInquilino(req, res, next) {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token mancante' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.ruolo !== 'inquilino') {
      return res.status(403).json({ error: 'Accesso riservato al portale inquilino' });
    }
    if (!payload.inquilino_id) {
      return res.status(403).json({ error: 'Account non collegato a un inquilino' });
    }
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Token non valido o scaduto' });
  }
}

module.exports = { requireInquilino };
