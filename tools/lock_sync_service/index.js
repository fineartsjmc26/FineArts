const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports: [new winston.transports.Console({ format: winston.format.simple() })]
});

logger.warn('Lock sync service is intentionally disabled. The app uses the local-only lock-state.js system and never stores lock metadata in Firestore.');

// This helper is kept only as a safety guard against accidental reactivation.
// It must never write lock state to Firestore.
process.exit(0);
