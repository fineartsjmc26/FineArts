# Cloudflare Load Balancer — Attendance Web App

Fronts the GitHub Pages origin with a Cloudflare global load balancer.
Cloudflare is the only practical way to load balance an external GitHub Pages
host — nginx/HAProxy on a single machine cannot scale GitHub Pages.

## Topology

```
User ──> https://attendance.finearts.edu (CNAME -> *.cdn.cloudflare.net)
            │
        Cloudflare Load Balancer  (region steering, health checks, failover)
            │
            └──> Origin pool: fineartsjmc26.github.io/FineArts/   (GitHub Pages)
```

## Requirements

- A domain you own with its nameservers on **Cloudflare** (you get `zone_id` there)
- Cloudflare **Load Balancing** is a paid add-on ($5/mo base) on the zone
- Terraform installed locally, or use the dashboard steps below

## Terraform deploy

```bash
cd infra/load-balancers/cloudflare

terraform init
terraform apply \
  -var cloudflare_api_token=... \
  -var zone_id=... \
  -var zone_name=finearts.edu \
  -var hostname=attendance.finearts.edu
```

`origin_host`, `origin_path`, and `origin_port` default to the GitHub Pages
deployment (`fineartsjmc26.github.io`, `/FineArts/`, 443) and can be overridden.

## Dashboard setup (no Terraform)

1. In Cloudflare dashboard open your zone → **Traffic → Load Balancing**.
2. **Health checks**: create an HTTPS monitor, path `/FineArts/index.html`,
   expected body `Attendance`, expected code `2xx`.
3. **Origin pool**: add `fineartsjmc26.github.io` (port 443), attach the monitor.
4. **Create load balancer** on hostname `attendance.finearts.edu`:
   - Default pool: the GitHub Pages pool
   - Steering: Random / Latency
   - Add more pools (e.g. a second mirror site) to spread traffic.
5. Cloudflare creates the CNAME automatically and proxies it.

## Adding a second origin (real load balancing)

To actually distribute load across more than one backend, add another origin
(or pool) hosting a mirror of the app — e.g. the same site deployed to Firebase
Hosting or a second GitHub account — and include it in the pool list. The LB
then round-robins and fails over between them automatically.