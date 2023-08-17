---
'ai': patch
---

Add experimental_StreamData and new opt-in wire protocol to enable streaming additional data. See https://github.com/vercel/ai/pull/425.

Changes `onCompletion` back to run every completion, including recursive function calls. Adds an `onFinish` callback that runs once everything has streamed.

If you're using experimental function handlers on the server _and_ caching via `onCompletion`, 
you may want to adjust your caching code to account for recursive calls so the same key isn't used. 

```
let depth = 0

const stream = OpenAIStream(response, {
    async onCompletion(completion) {
      depth++
      await kv.set(key + '_' + depth, completion)
      await kv.expire(key + '_' + depth, 60 * 60)
    }
  })
```
