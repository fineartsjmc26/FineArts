HAProxy (multiple VMs)

Overview
- HAProxy is a performant TCP/HTTP load balancer suitable for multiple backend VMs.

Files
- `haproxy.cfg` — sample configuration.

Deploy
1. Install HAProxy on a dedicated VM.
2. Place `haproxy.cfg` at `/etc/haproxy/haproxy.cfg` and restart service:

```bash
sudo systemctl restart haproxy
```

3. Monitor stats endpoint (if enabled) and adjust backend server list as needed.
