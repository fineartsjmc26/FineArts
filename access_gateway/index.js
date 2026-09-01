require('dotenv').config();
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const admin = require('firebase-admin');
const path = require('path');
const winston = require('winston');
let client;
try { client = require('prom-client'); } catch (e) { client = null; }

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports: [new winston.transports.Console({ format: winston.format.simple() })]
});

// Initialize Firebase Admin (expect GOOGLE_APPLICATION_CREDENTIALS or explicit path)
if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
  const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  try {
    admin.initializeApp({
      credential: admin.credential.cert(require(path.resolve(keyPath)))
    });
    logger.info('Firebase Admin initialized using service account.');
  } catch (e) {
    logger.warn('Firebase Admin init failed: ' + String(e));
  }
} else {
  try {
    admin.initializeApp();
    logger.info('Firebase Admin initialized with default credentials.');
  } catch (e) {
    logger.warn('Firebase Admin failed to initialize automatically; token verification may fail.');
  }
}

const UPSTREAM = process.env.UPSTREAM_URL || 'http://localhost:3000';
const LOCK_PATTERNS = (process.env.LOCK_ENDPOINT_PATTERNS || '/lock,/unlock,/teams/:id/lock').split(',').map(s => s.trim()).filter(Boolean);
const PORT = parseInt(process.env.PORT || '4000', 10);

// Metrics: use prom-client if available, otherwise fall back to simple counters
let blockedCounter, allowedCounter;
if (client) {
  blockedCounter = new client.Counter({ name: 'gateway_blocked_requests_total', help: 'Blocked non-admin requests to lock endpoints' });
  allowedCounter = new client.Counter({ name: 'gateway_allowed_requests_total', help: 'Allowed requests to lock endpoints' });
} else {
  blockedCounter = { inc: () => { blockedCounter._ = (blockedCounter._ || 0) + 1; } };
  allowedCounter = { inc: () => { allowedCounter._ = (allowedCounter._ || 0) + 1; } };
}

function createApp() {
  const app = express();

  // Simple middleware to parse auth token and attach decoded claims
  async function decodeFirebaseToken(req, res, next) {
    // For local testing, allow X-Debug-User header with JSON payload
    const debugHeader = req.headers['x-debug-user'];
    if (process.env.DEBUG_FAKE_USER && debugHeader) {
      try { req.user = JSON.parse(debugHeader); return next(); } catch (e) { }
    }
    const auth = req.headers.authorization || req.headers.Authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }
    const idToken = auth.split('Bearer ')[1];
    try {
      const decoded = await admin.auth().verifyIdToken(idToken);
      req.user = decoded;
    } catch (err) {
      logger.warn('Failed to verify token: ' + String(err));
      req.user = null;
    }
    return next();
  }

  app.use(decodeFirebaseToken);

  function isLockEndpoint(req) {
    const p = req.path.toLowerCase();
    for (const pattern of LOCK_PATTERNS) {
      if (pattern.includes(':')) {
        const base = pattern.split('/:')[0];
        if (p.startsWith(base)) return true;
      }
      if (p.includes(pattern.replace('/', ''))) return true;
      if (p === pattern) return true;
    }
    return false;
  }

  function adminOnlyForLocks(req, res, next) {
    if (!isLockEndpoint(req)) return next();
    const user = req.user;
    const allow = user && (user.admin === true || user.role === 'admin' || (user.roles && user.roles.indexOf('admin') !== -1));
    if (allow) { allowedCounter.inc(); return next(); }
    const modMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
    if (modMethods.includes(req.method.toUpperCase())) {
      blockedCounter.inc();
      logger.info(`Blocked non-admin ${req.method} to ${req.path}`);
      return res.status(403).json({ error: 'forbidden', message: 'Admin role required to perform this action.' });
    }
    return next();
  }

  app.use(adminOnlyForLocks);

  app.use('/', createProxyMiddleware({
    target: UPSTREAM,
    changeOrigin: true,
    logProvider: () => ({
      log: logger.info.bind(logger),
      debug: logger.debug.bind(logger),
      info: logger.info.bind(logger),
      warn: logger.warn ? logger.warn.bind(logger) : logger.info.bind(logger),
      error: logger.error.bind(logger)
    })
  }));

  app.get('/__health', (req, res) => res.json({ ok: true, upstream: UPSTREAM }));
  app.get('/metrics', async (req, res) => {
    try {
      if (client) {
        res.set('Content-Type', client.register.contentType);
        res.end(await client.register.metrics());
      } else {
        res.set('Content-Type', 'text/plain');
        res.end(`# HELP gateway_blocked_requests_total Fallback metric\n# TYPE gateway_blocked_requests_total counter\n${(blockedCounter._||0)}\n`);
      }
    } catch (ex) {
      res.status(500).end(String(ex));
    }
  });

  return app;
}

if (require.main === module) {
  const app = createApp();
  app.listen(PORT, () => {
    logger.info(`Access gateway listening on ${PORT}, forwarding to ${UPSTREAM}`);
    logger.info(`Lock patterns: ${LOCK_PATTERNS.join(',')}`);
  });
}

module.exports = { createApp };
