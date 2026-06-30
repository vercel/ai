---
"@ai-sdk/provider": patch
"ai": patch
"@ai-sdk/alibaba": patch
"@ai-sdk/bytedance": patch
"@ai-sdk/google": patch
"@ai-sdk/google-vertex": patch
"@ai-sdk/klingai": patch
"@ai-sdk/xai": patch
---

feat (video): support video reference inputs and reference roles in `inputReferences` for reference-to-video generation

`inputReferences` now accepts video references in addition to images, and each reference may carry an optional `referenceType` (`subject` by default, or `style`) describing what the model should do with it. Pass the object form to set an explicit `mediaType` (to route URL-based references as video or image) and/or `referenceType`:

```ts
await generateVideo({
  model,
  prompt: 'Match the motion in the reference clip',
  inputReferences: [
    { data: 'https://example.com/reference.mp4', mediaType: 'video/mp4' },
    { data: 'https://example.com/style.png', referenceType: 'style' },
  ],
});
```

Adds an optional `mediaType` field to `VideoModelV4File` URL parts and a new `VideoModelV4Reference` type (a file plus an optional `referenceType`) so providers can distinguish references by both modality and role. Google/Vertex (Veo) map `subject` to an `asset` reference and `style` to a `style` reference. Providers that only support subject references (Alibaba, ByteDance, KlingAI, xAI) warn when a `style` reference is provided and treat it as `subject`. Providers that do not support video references (KlingAI, xAI) warn and ignore them; ByteDance routes them to its reference video input. Also removes unsupported `gs://` image handling from the Google Generative AI video model (GCS URIs are Vertex-only).
