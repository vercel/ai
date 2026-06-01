---
"ai": patch
---

fix(ai): harden `getMediaTypeFromUrl` against prototype-property collisions

`getMediaTypeFromUrl` (used to infer media types for `file-url` / `image-url` parts) used `ext in URL_EXTENSION_TO_MEDIA_TYPE` against a plain object literal. A URL ending in `.constructor` therefore resolved through the prototype chain and returned the `Object` constructor function, violating the helper's `: string` return type and forwarding a non-string value to provider adapters.

Switch to `Object.hasOwn(...)` so attacker-controlled extensions like `.constructor` cannot resolve to inherited `Object.prototype` keys.
