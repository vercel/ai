---
'@ai-sdk/azure': major
'@ai-sdk/deepinfra': major
'@ai-sdk/fal': major
'@ai-sdk/fireworks': major
'@ai-sdk/google-vertex': major
'@ai-sdk/luma': major
'@ai-sdk/openai-compatible': major
'@ai-sdk/openai': major
'@ai-sdk/replicate': major
'@ai-sdk/togetherai': major
'@ai-sdk/xai': major
'ai': major
---

### Move Image Model Settings into generate options

Image Models no longer have settings. Instead, `maxImagesPerCall` can be passed directly to `generateImage()`. All other image settings can be passed to `providerOptions[provider]`.

Before

```js
await generateImage({
  model: luma.image('photon-flash-1', {
    maxImagesPerCall: 5,
    pollIntervalMillis: 500,
  }),
  prompt,
  n: 10,
});
```

After

```js
await generateImage({
  model: luma.image('photon-flash-1'),
  prompt,
  n: 10,
  maxImagesPerCall: 5,
  providerOptions: {
    luma: { pollIntervalMillis: 5 },
  },
});
```

Pull Request: https://github.com/vercel/ai/pull/6180
