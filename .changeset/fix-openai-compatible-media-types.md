---
'@ai-sdk/openai-compatible': patch
---

Support audio URLs, non-wav/mp3 audio formats (e.g. ogg, flac, aac), and video media types in the OpenAI-compatible provider. Previously these threw `UnsupportedFunctionalityError`; they are now passed through as `image_url` parts with data URLs, which is the standard inline media format used by Gemini and other OpenAI-compatible providers.
