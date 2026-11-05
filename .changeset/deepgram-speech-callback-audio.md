---
'@ai-sdk/deepgram': patch
---

fix (deepgram): reject the speech `callback` provider option instead of returning Deepgram's JSON acknowledgement as audio. With a callback URL, Deepgram processes the request asynchronously and answers with `{"request_id": "..."}` instead of audio, which `generateSpeech` previously returned as corrupt audio bytes. The provider now throws an `InvalidArgumentError` before sending the request, and warns when `callbackMethod` is passed without `callback`.

If you relied on callback delivery, call Deepgram's `/v1/speak` REST API directly; `generateSpeech` always needs the audio in the response.
