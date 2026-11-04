---
'@ai-sdk/gateway': patch
'@ai-sdk/amazon-bedrock': patch
'@ai-sdk/bytedance': patch
'@ai-sdk/fal': patch
'@ai-sdk/google': patch
'@ai-sdk/google-vertex': patch
'@ai-sdk/klingai': patch
'@ai-sdk/replicate': patch
---

fix: pass through `seed: 0` instead of dropping it in image and video models. KlingAI now reports `seed: 0` as an unsupported setting like any other seed.
