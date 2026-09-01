Lock Sync Service
=================

Purpose: background service that watches the Firestore `attendance_master_data/appData` document and enforces canonical lock state for attendance records across all clients.

Behavior
- Listens to the Firestore document, reconciles records to ensure `locked` and `teamLocked` are set where students are marked.
- Detects students marked in multiple teams for same date and ensures affected records are locked.
- Writes corrections using Firestore transactions to avoid overwriting concurrent updates.

Configuration
- Provide Firebase service account via `FIREBASE_SERVICE_ACCOUNT_PATH` env pointing to JSON, or rely on ADC (Application Default Credentials) in the environment.

Run locally
```
cd tools/lock_sync_service
npm install
FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/serviceAccount.json node index.js
```

Docker
```
cd tools/lock_sync_service
docker build -t lock-sync-service:latest .
docker run -e FIREBASE_SERVICE_ACCOUNT_PATH=/run/secrets/serviceAccount.json -v /local/path/serviceAccount.json:/run/secrets/serviceAccount.json lock-sync-service:latest
```

Notes
- This service is non-invasive and writes only corrected fields under the existing Firestore document; it does not change schemas or client code.
- Run in staging first to observe corrections in logs before deploying to production.
