Self-signed certificate and public test key for local HTTPS transport tests only.
The certificate is valid for `127.0.0.1`; connecting through `::1` tests hostname
verification. Tests explicitly trust this certificate in isolated child processes
using `NODE_EXTRA_CA_CERTS`. No TLS verification is disabled.

Generated with:

```sh
openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem \
  -days 36500 -subj /CN=download-test -addext subjectAltName=IP:127.0.0.1
```
