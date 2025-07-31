---
'@ai-sdk/provider': patch
---

chore (provider): allow both binary and base64 file content (spec)

Before

```ts
import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';

// Had to manually convert binary data to base64
const fileData = new Uint8Array([0, 1, 2, 3]);
const filePart = {
  type: 'file',
  mediaType: 'application/pdf',
  data: convertUint8ArrayToBase64(fileData), // Required conversion
};
```

After

```ts
// Can use binary data directly
const fileData = new Uint8Array([0, 1, 2, 3]);
const filePart = {
  type: 'file',
  mediaType: 'application/pdf',
  data: fileData, // Direct Uint8Array support
};
```
