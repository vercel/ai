---
'@ai-sdk/prodia': patch
---

feat(provider/prodia): Add LanguageModel and VideoModel support to the Prodia provider.

- **LanguageModel**: Supports Nano Banana (`inference.nano-banana.img2img.v2`) for img2img generation with text+image output via multipart form-data requests. Implements both `doGenerate` and `doStream`.
- **VideoModel**: Supports Wan 2.2 Lightning for text-to-video (`inference.wan2-2.lightning.txt2vid.v0`) and image-to-video (`inference.wan2-2.lightning.img2vid.v0`) generation.
- Extract shared multipart parsing and error handling infrastructure into `prodia-api.ts`.
