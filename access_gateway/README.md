Access Gateway
================

Purpose: a small reverse-proxy that enforces admin-only access for lock/unlock endpoints and forwards all other traffic to the existing application without modifying it.

Usage
-----

1. Configure environment variables (see `.env.example`). Ensure the gateway can verify tokens — for Firebase, set `GOOGLE_APPLICATION_CREDENTIALS` or `FIREBASE_SERVICE_ACCOUNT_PATH`.

2. Run locally:

```bash
npm install
PORT=4000 UPSTREAM_URL=http://localhost:3000 node index.js
```

3. Deploy as sidecar or replace current frontend/backend routing at the load balancer so requests pass through this gateway. It returns 403 for non-admin modification attempts to lock/unlock endpoints.

Configuration
-------------
- `UPSTREAM_URL`: URL of the existing application to forward requests to (default `http://localhost:3000`).
- `PORT`: port to listen on (default `4000`).
- `LOCK_ENDPOINT_PATTERNS`: comma-separated patterns to identify lock endpoints (defaults include `/lock,/unlock,/teams/:id/lock`).
- `FIREBASE_SERVICE_ACCOUNT_PATH` or `GOOGLE_APPLICATION_CREDENTIALS`: path to service account JSON to verify Firebase ID tokens.

Assumptions
-----------
- The system uses Firebase Authentication (ID tokens) or a JWT scheme compatible with `firebase-admin` verification. If another auth provider is used, replace the token verification logic accordingly.
- Lock/unlock endpoints include recognizable path segments like `lock` or `unlock`. Adjust `LOCK_ENDPOINT_PATTERNS` as needed.

Compatibility
-------------
This gateway does not modify any existing code, schemas, or client behavior. It enforces admin-only access by returning HTTP 403 for forbidden requests. UI elements can remain unchanged; the app should handle 403 responses by disabling or hiding features as appropriate.
