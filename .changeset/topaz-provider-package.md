---
'@ai-sdk/topaz': major
---

feat (provider/topaz): add Topaz Labs provider

Adds `@ai-sdk/topaz` with image and video enhancement support for the Topaz Labs API:

- `topaz.image('wonder-3.5')` — generative image upscaling. The provider submits the async enhance job, polls it, and downloads the result.
- `topaz.video('proteus')` and `topaz.video('starlight-precise-2.6')` — video enhancement via the spec-v4 async operation protocol, running the Topaz create/accept/upload/complete-upload flow in `doStart` and polling in `doStatus`.

Topaz enhances media the caller supplies: the image is passed through the prompt's `images` and the video through `inputReferences`. Video requests also need source metadata (resolution, duration, frame rate, frame count) up front, which the provider assembles from the standard call options and the `source` provider option.
