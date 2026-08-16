Nginx reverse-proxy (single VM)

Overview
- Use Nginx as a reverse proxy / load balancer in front of one or more backend app servers.

Files
- `nginx.conf` — sample server and upstream configuration.

Deploy
1. Install Nginx on your VM (Ubuntu example):

```bash
sudo apt update
sudo apt install -y nginx
```

2. Place `nginx.conf` at `/etc/nginx/sites-available/attendance` and symlink to `/etc/nginx/sites-enabled/attendance`.
3. Test and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

TLS/HTTPS
- Terminate TLS at Nginx using certbot or provide a TLS certificate.
