---
'@ai-sdk/react': patch
---

fix: useChat now reflects updated body/headers in transport without remounting

- Wrapped transport with a ref-based proxy so Chat instance always uses current transport values
- Prevents stale closure over initial body/headers when transport is recreated with new values
