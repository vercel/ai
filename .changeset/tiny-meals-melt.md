---
'@ai-sdk/prodia': patch
---

feat(provider/prodia): Add LanguageModel support to the Prodia provider.

- **LanguageModel**: Supports Nano Banana (`inference.nano-banana.img2img.v2`) for img2img generation with text+image output via multipart form-data requests. Implements both `doGenerate` and `doStream`.
- Extract shared multipart parsing and error handling infrastructure into `prodia-api.ts`.
