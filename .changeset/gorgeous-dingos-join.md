---
'ai': patch
---

feat(ai): add convertDataPart option to convertToModelMessages

Add optional convertDataPart callback for converting custom data parts (URLs, code files, etc.) to text or file parts that models can process. Fully type-safe using existing UIMessage generics.
