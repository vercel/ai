---
'ai': patch
---

fix(security): validate redirect targets in download functions to prevent SSRF bypass

`download` now validates the final URL after following HTTP redirects, preventing attackers from bypassing SSRF protections via open redirects to internal/private addresses.
