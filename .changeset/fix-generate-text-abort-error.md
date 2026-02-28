---
'ai': patch
---

fix: re-throw AbortError in generateText instead of silently swallowing it

- Re-throw AbortError in execute-tool-call.ts catch block instead of converting to tool-error
- Check abort signal at start of each do-while loop iteration in generate-text.ts
