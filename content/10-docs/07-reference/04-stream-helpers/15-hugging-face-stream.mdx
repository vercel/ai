---
title: HuggingFaceStream
description: Learn to use HuggingFaceStream helper function in your application.
---

# `HuggingFaceStream`

<Note type="warning">HuggingFaceStream has been removed in AI SDK 4.0.</Note>

<Note type="warning">
  HuggingFaceStream is part of the legacy Hugging Face integration. It is not
  compatible with the AI SDK 3.1 functions.
</Note>

Converts the output from language models hosted on Hugging Face into a ReadableStream.

While HuggingFaceStream is compatible with most Hugging Face language models, the rapidly evolving landscape of models may result in certain new or niche models not being supported. If you encounter a model that isn't supported, we encourage you to open an issue.

To ensure that AI responses are comprised purely of text without any delimiters that could pose issues when rendering in chat or completion modes, we standardize and remove special end-of-response tokens. If your use case requires a different handling of responses, you can fork and modify this stream to meet your specific needs.

Currently, `</s>` and `<|endoftext|>` are recognized as end-of-stream tokens.

## Import

### React

<Snippet text={`import { HuggingFaceStream } from "ai"`} prompt={false} />

## API Signature

### Parameters

<PropertiesTable
  content={[
    {
      name: 'iter',
      type: 'AsyncGenerator<any>',
      description:
        'This parameter should be the generator function returned by the hf.textGenerationStream method in the Hugging Face Inference SDK.',
    },
    {
      name: 'callbacks',
      type: 'AIStreamCallbacksAndOptions',
      isOptional: true,
      description:
        'An object containing callback functions to handle the start, each token, and completion of the AI response. In the absence of this parameter, default behavior is implemented.',
      properties: [
        {
          type: 'AIStreamCallbacksAndOptions',
          parameters: [
            {
              name: 'onStart',
              type: '() => Promise<void>',
              description:
                'An optional function that is called at the start of the stream processing.',
            },
            {
              name: 'onCompletion',
              type: '(completion: string) => Promise<void>',
              description:
                "An optional function that is called for every completion. It's passed the completion as a string.",
            },
            {
              name: 'onFinal',
              type: '(completion: string) => Promise<void>',
              description:
                'An optional function that is called once when the stream is closed with the final completion message.',
            },
            {
              name: 'onToken',
              type: '(token: string) => Promise<void>',
              description:
                "An optional function that is called for each token in the stream. It's passed the token as a string.",
            },
          ],
        },
      ],
    },
  ]}
/>

### Returns

A `ReadableStream`.
