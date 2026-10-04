---
'@ai-sdk/harness-claude-code': patch
---

Fix over-reported `finish` metadata cost when Claude Code returns multiple results. `harnessMetadata['claude-code'].costUsd` now uses the latest cumulative `total_cost_usd` instead of adding running totals together, including costs carried forward by resumed sessions.
