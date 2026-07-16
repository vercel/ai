---
'@ai-sdk/langchain': patch
---

Fix `convertUserContent` throwing `RangeError: Maximum call stack size exceeded` on large binary image and file inputs. The base64 encoding used `btoa(String.fromCharCode(...bytes))`, which passes one argument per byte and overflows the argument limit for real-sized images and documents. It now uses `convertUint8ArrayToBase64` from `@ai-sdk/provider-utils`, which the rest of the SDK already relies on. The encoded output is unchanged for inputs that did not previously overflow.
