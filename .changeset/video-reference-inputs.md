---
"@ai-sdk/provider": patch
"ai": patch
"@ai-sdk/bytedance": patch
"@ai-sdk/google": patch
"@ai-sdk/klingai": patch
"@ai-sdk/xai": patch
---

feat (video): support video reference inputs in `inputReferences` for reference-to-video generation

`inputReferences` now accepts video references in addition to images. Pass the object form with an explicit `mediaType` to route URL-based references as video or image:

```ts
await generateVideo({
  model,
  prompt: 'Match the motion in the reference clip',
  inputReferences: [{ data: 'https://example.com/reference.mp4', mediaType: 'video/mp4' }],
});
```

Adds an optional `mediaType` field to `VideoModelV4File` URL parts so providers can distinguish video from image references. Providers that do not support video references (KlingAI, xAI) warn and ignore them; ByteDance routes them to its reference video input. Also removes unsupported `gs://` image handling from the Google Generative AI video model (GCS URIs are Vertex-only).
