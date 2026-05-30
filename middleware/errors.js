'use strict';
function errorHandler(err, req, res, next) {
  console.error('❌ Error:', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Errore interno' });
}
function asyncWrap(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}
module.exports = { errorHandler, asyncWrap };
