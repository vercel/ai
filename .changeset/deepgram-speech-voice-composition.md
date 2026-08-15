---
"@ai-sdk/deepgram": minor
---

feat(deepgram): compose speech model ID from `voice` and `language`

Bare voice family IDs (`aura-2`, `aura`) now compose the upstream model ID
from the `generateSpeech` `voice` and `language` options
(`<family>-<voice>-<language>`, language defaults to `en`), e.g.
`deepgram.speech('aura-2')` + `voice: 'thalia'` → `aura-2-thalia-en`.
Full voice IDs (e.g. `aura-2-thalia-en`) are unchanged and the `voice`
warning still applies to them. The `DeepgramSpeechModelId` union now lists
all Aura-2 voices (en/es/nl/de/it/ja/fr) and Aura-1 voices.
