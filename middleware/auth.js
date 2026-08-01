'use strict';
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ FATAL: JWT_SECRET env var non impostata. Imposta JWT_SECRET nel pannello Railway.');
  process.exit(1);
}
function authMiddleware(req, res, next) {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token mancante' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token non valido o scaduto' });
  }
}

module.exports = { authMiddleware, JWT_SECRET };
