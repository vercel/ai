---
'@ai-sdk/amazon-bedrock': patch
---

Don't trim reasoning text when a cryptographic signature is present. The signature validates the exact original bytes, so trimming trailing whitespace invalidates it and causes Bedrock to reject the request.
