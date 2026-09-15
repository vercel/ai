---
'@ai-sdk/react': patch
---

Publish realtime session ownership and callbacks only when React commits. Keep control identities stable across renders, route retained controls to the current committed session, and revoke them on unmount. Preserve connected sessions when concurrent renders are abandoned, support StrictMode effect replay and React 18 server rendering, and expose continuous session metadata alongside turn-based messages.
