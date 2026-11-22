'use strict';
/** Basit bellek içi oran sınırlayıcı (tek süreç için yeterli). */
const buckets = new Map();

function rateLimit({ windowMs = 60000, max = 60, key = (req) => req.ip, message = 'Çok fazla istek gönderdiniz. Lütfen biraz bekleyin.' } = {}) {
  return (req, res, next) => {
    const k = key(req);
    const now = Date.now();
    let b = buckets.get(k);
    if (!b || b.reset < now) { b = { count: 0, reset: now + windowMs }; buckets.set(k, b); }
    b.count++;
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - b.count)));
    if (b.count > max) {
      const retry = Math.ceil((b.reset - now) / 1000);
      res.setHeader('Retry-After', String(retry));
      return res.status(429).json({ error: message, retryAfter: retry });
    }
    next();
  };
}

// Süpürme
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
}, 60000).unref();

module.exports = { rateLimit };
