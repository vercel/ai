---
"@ai-sdk/harness-deepagents": patch
---

fix(harness-deepagents): persist conversation checkpoint across session stop and resume

Persist LangGraph MemorySaver checkpoints to the bridge state directory so a sandbox snapshot retains conversation history. New bridge processes reload the checkpoint file on startup, preserving context when a session stopped via session.stop() is resumed in a separate host process.
