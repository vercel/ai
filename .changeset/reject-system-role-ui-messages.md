---
"ai": patch
---

fix(agent): reject `role: 'system'` in `createAgentUIStream` / `createAgentUIStreamResponse` inputs

Client-supplied UI messages cross an untrusted boundary. Previously, a `role: 'system'` entry would be forwarded to the model alongside the developer's `instructions`, enabling prompt injection by any caller. The agent UI stream now throws `InvalidArgumentError` if any UI message has `role: 'system'`. Set system instructions on the agent via the `instructions` setting instead.
