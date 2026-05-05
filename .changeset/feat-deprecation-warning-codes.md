---
'ai': patch
---

`logWarnings` now emits `process.emitWarning()` with `type: 'DeprecationWarning'` and a stable `code` (`AISDK_DEP_*`) for deprecated warnings, enabling `--no-deprecation` / `--throw-deprecation` filtering on a per-code basis.
