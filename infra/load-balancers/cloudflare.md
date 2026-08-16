Cloudflare Load Balancer (GitHub Pages / static site)

Overview
- Use Cloudflare Load Balancer to front multiple origins (e.g., GitHub Pages primary + fallback, or multiple static origin buckets).
- Useful for global traffic steering and health checks.

Quick steps (UI)
1. Add your site to Cloudflare and point DNS to Cloudflare nameservers.
2. Go to "Traffic -> Load Balancing" and create an Origin Pool. Add origin(s) such as `your-org.github.io` or origin server IPs.
3. Create a Load Balancer, set the DNS name (e.g., `attendance.example.com`), select pools and health checks, and enable proxied traffic.

API example (replace placeholders):
curl -X POST "https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/load_balancers" \
  -H "Authorization: Bearer <API_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{
    "name":"attendance.example.com",
    "fallback_pool":"<POOL_ID>",
    "default_pools":["<POOL_ID>"],
    "proxied":true,
    "region_pools":[],
    "ttl":60
  }'

Notes
- GitHub Pages sites can be configured as origins by using CNAMEs to `username.github.io`, but Cloudflare's Load Balancer health checks should target an HTTP path.
- Keep your API token scoped to Load Balancers and DNS management.
