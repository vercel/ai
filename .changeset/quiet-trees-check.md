---
'@ai-sdk/harness-acp': patch
---

Require host approval for native file operations outside the session workspace under restrictive permission modes. Automatic approvals now check every declared location, including symlinks and new-file destinations, and require approval when file locations are missing or cannot be resolved.
