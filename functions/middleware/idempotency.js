const { getById, create } = require('../lib/db');

// Idempotency guard for offline sync. Any mutating request that carries an
// 'X-Op-Id' header is processed at most once: if we've already completed that
// op, we replay the stored 2xx response instead of running it again. This
// prevents duplicate parts/photos/etc. when a queued action is retried after a
// lost response. Non-mutations and requests without the header are untouched.
module.exports = async function idempotency(req, res, next) {
  try {
    const key = req.headers['x-op-id'];
    if (!key || !['POST', 'PUT', 'DELETE'].includes(req.method)) return next();

    const prior = await getById('idempotency_keys', String(key));
    if (prior && prior.body !== undefined) {
      return res.status(prior.status || 200).json(prior.body);
    }

    const origJson = res.json.bind(res);
    res.json = (body) => {
      // Only remember successful results — errors/conflicts stay retryable.
      if (res.statusCode >= 200 && res.statusCode < 300) {
        create('idempotency_keys', String(key), { status: res.statusCode, body, at: new Date().toISOString() }).catch(() => {});
      }
      return origJson(body);
    };
    next();
  } catch (e) {
    next();
  }
};
