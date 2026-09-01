const admin = require('firebase-admin');
const path = require('path');
const winston = require('winston');

const logger = winston.createLogger({ level: process.env.LOG_LEVEL || 'info', transports: [new winston.transports.Console({ format: winston.format.simple() })] });

// Initialize Firebase Admin
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const key = require(path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH));
    admin.initializeApp({ credential: admin.credential.cert(key) });
    logger.info('Firebase Admin initialized (service account).');
  } else {
    admin.initializeApp();
    logger.info('Firebase Admin initialized (default).');
  }
} catch (e) {
  logger.error('Failed to initialize Firebase Admin: ' + e.message);
  process.exit(1);
}

const db = admin.firestore();
const docRef = db.collection('attendance_master_data').doc('appData');

function canonicalizeRecord(rec) {
  const out = Object.assign({}, rec);
  // Ensure flags exist
  if (!('locked' in out)) out.locked = !!(out && out.studentAttendanceMap && Object.keys(out.studentAttendanceMap || {}).length);
  if (!('teamLocked' in out)) out.teamLocked = out.locked;
  if (!('unlockMode' in out)) out.unlockMode = out.locked ? 'admin' : 'admin';
  return out;
}

async function reconcile(serverData) {
  const appData = serverData || {};
  const attendance = Array.isArray(appData.attendance) ? appData.attendance : [];
  let changed = false;
  const fixed = attendance.map(rec => {
    const c = canonicalizeRecord(rec || {});
    // If studentAttendanceMap exists, ensure locked and teamLocked
    if (c.studentAttendanceMap && Object.keys(c.studentAttendanceMap).length) {
      if (!c.locked) { c.locked = true; changed = true; }
      if (!c.teamLocked) { c.teamLocked = true; changed = true; }
      if (!c.unlockMode) { c.unlockMode = 'admin'; changed = true; }
    }
    return c;
  });

  // Additionally, detect students marked in multiple teams for same date and set locks
  const byDateStudent = {};
  fixed.forEach(rec => {
    if (!rec || !rec.date || !rec.studentAttendanceMap) return;
    Object.keys(rec.studentAttendanceMap).forEach(sid => {
      const key = `${rec.date}::${sid}`;
      byDateStudent[key] = byDateStudent[key] || [];
      byDateStudent[key].push(rec.teamId);
    });
  });
  Object.keys(byDateStudent).forEach(k => {
    if (byDateStudent[k].length > 1) {
      // multiple teams have this student for same date -> ensure those records are locked
      const parts = k.split('::');
      const date = parts[0];
      const sid = parts[1];
      fixed.forEach(rec => {
        if (rec.date === date && rec.studentAttendanceMap && rec.studentAttendanceMap[sid]) {
          if (!rec.locked) { rec.locked = true; changed = true; }
        }
      });
    }
  });

  if (!changed) return null;

  // Build merged appData
  const merged = Object.assign({}, appData, { attendance: fixed });
  merged.__lockSyncMeta = { lastSynced: new Date().toISOString() };
  return merged;
}

async function start() {
  const OBSERVE_ONLY = process.env.OBSERVE_ONLY === '1' || process.env.OBSERVE_ONLY === 'true';
  logger.info(`Starting lock sync service... observe-only=${OBSERVE_ONLY}`);
  const unsubscribe = docRef.onSnapshot(async (snap) => {
    try {
      const data = snap.exists ? snap.data() : {};
      const corrected = await reconcile(data);
      if (corrected) {
        logger.info('Detected inconsistent lock state');
        if (OBSERVE_ONLY) {
          logger.info('Observe-only mode enabled — not writing corrections.');
        } else {
          logger.info('Applying corrections');
          // Use transaction to avoid clobbering other changes
          await db.runTransaction(async (txn) => {
            const s = await txn.get(docRef);
            const server = s.exists ? s.data() : {};
            const serverAttendance = Array.isArray(server.attendance) ? server.attendance : [];
            if (JSON.stringify(serverAttendance) !== JSON.stringify(corrected.attendance)) {
              const newData = Object.assign({}, server, { attendance: corrected.attendance, __lockSyncMeta: corrected.__lockSyncMeta });
              txn.set(docRef, newData);
              logger.info('Corrections written to Firestore');
            } else {
              logger.info('Server attendance already matches corrected state; no write needed');
            }
          });
        }
      }
    } catch (e) {
      logger.error('Error reconciling lock state: ' + (e && e.message));
    }
  }, (err) => {
    logger.error('Snapshot listener error: ' + (err && err.message));
  });
  process.on('SIGINT', () => { unsubscribe(); logger.info('Shutting down'); process.exit(0); });
}

start().catch(err => { logger.error('Fatal error: ' + err.message); process.exit(1); });
