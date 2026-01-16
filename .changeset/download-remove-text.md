---
'ai': patch
---

feat(ai): extend experimental_download to support remove and text replacement

Adds two new return types:

- `null` → remove the part (for 404s, invalid URLs)
- `string` → replace with text

**Breaking:** `null` previously meant passthrough. Now return the `URL` to passthrough.

```typescript
// Before
return null;

// After
return url; // passthrough
return null; // remove
return '[Image unavailable]'; // text
```
