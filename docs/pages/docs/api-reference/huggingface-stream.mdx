# HuggingFaceStream

## `HuggingFaceStream(iter: AsyncGenerator<any>, cb?: AIStreamCallbacks): ReadableStream` [#huggingfacestream]

The `HuggingFaceStream` function is a utility that transforms the output from an array of text generation models hosted on [Hugging Face.co](https://huggingface.co) into a `ReadableStream`. The transformation uses an `AsyncGenerator` as provided by the [Hugging Face Inference SDK](https://huggingface.co/docs/huggingface.js/inference/README)'s `hf.textGenerationStream` method. This feature enables you to handle AI responses in real-time by means of a readable stream.

While `HuggingFaceStream` is compatible with _most_ Hugging Face text generation models, the rapidly evolving landscape of models may result in certain new or niche models not being supported. If you encounter a model that isn't supported, we encourage you to [open an issue](https://github.com/vercel/ai/issues/new).

To ensure that AI responses are comprised purely of text without any delimiters that could pose issues when rendering in chat or completion modes, we standardize and remove special end-of-response tokens. If your use case requires a different handling of responses, you can fork and modify this stream to meet your specific needs.

Currently, `</s>` and `<|endoftext|>` are recognized as end-of-stream tokens.

`HuggingFaceStream` is compatible with the following models, as specified through the `model` parameter in the Hugging Face Inference SDK:

- [`OpenAssistant/oasst-sft-4-pythia-12b-epoch-3.5`](https://huggingface.co/OpenAssistant/oasst-sft-4-pythia-12b-epoch-3.5)
- [`EleutherAI/gpt-neox-20b`](https://huggingface.co/EleutherAI/gpt-neox-20b)
- [`google/flan-ul2`](https://huggingface.co/google/flan-ul2)
- [`google/flan-t5-xxl`](https://huggingface.co/google/flan-t5-xxl)
- [`bigscience/bloomz`](https://huggingface.co/bigscience/bloomz)
- [`bigscience/bloom`](https://huggingface.co/bigscience/bloom)
- [`bigcode/santacoder`](https://huggingface.co/bigcode/santacoder)

## Parameters

### `iter: AsyncGenerator<any>`

This parameter should be an `AsyncGenerator`, as returned by the `hf.textGenerationStream` method in the Hugging Face Inference SDK.

### `cb?: AIStreamCallbacks`

This optional parameter can be an object containing callback functions to handle the start, each token, and completion of the AI response. In the absence of this parameter, default behavior is implemented.

## Example

The `HuggingFaceStream` function can be coupled with the Hugging Face Inference SDK to generate a readable stream from a text generation stream. This stream can then facilitate the real-time consumption of AI outputs as they're being generated.

Here's a step-by-step example of how to implement `HuggingFaceStream`:

```tsx filename="app/api/completion/route.ts"
import { HfInference } from '@huggingface/inference'
import { HuggingFaceStream, StreamingTextResponse } from 'ai'

export const runtime = 'edge'

const Hf = new HfInference(process.env.HUGGINGFACE_API_KEY)

export async function POST(req: Request) {
  const { prompt } = await req.json()

  // Initialize a text generation stream using Hugging Face Inference SDK
  const iter = await Hf.textGenerationStream({
    model: 'google/flan-t5-xxl',
    inputs: prompt,
    parameters: {
      max_new_tokens: 200,
      temperature: 0.5,
      repetition_penalty: 1,
      return_full_text: false
    }
  })

  // Convert the async generator into a readable stream
  const stream = HuggingFaceStream(iter)

  // Return a StreamingTextResponse, enabling the client to consume the response
  return new StreamingTextResponse(stream)
}
```

In this example, the `HuggingFaceStream` function transforms the text generation stream from the Hugging Face Inference SDK into a `ReadableStream`. This allows clients to consume AI outputs in real-time as they're generated, instead of waiting for the complete response.
