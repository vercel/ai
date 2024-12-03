---
title: ReplicateStream
description: Learn to use ReplicateStream helper function in your application.
---

# `ReplicateStream`

<Note type="warning">ReplicateStream has been removed in AI SDK 4.0.</Note>

<Note type="warning">
  ReplicateStream is part of the legacy Replicate integration. It is not
  compatible with the AI SDK 3.1 functions.
</Note>

The ReplicateStream function is a utility that handles extracting the stream from the output of [Replicate](https://replicate.com)'s API. It expects a Prediction object as returned by the [Replicate JavaScript SDK](https://github.com/replicate/replicate-javascript), and returns a ReadableStream. Unlike other wrappers, ReplicateStream returns a Promise because it makes a fetch call to the [Replicate streaming API](https://github.com/replicate/replicate-javascript#streaming) under the hood.

## Import

### React

<Snippet text={`import { ReplicateStream } from "ai"`} prompt={false} />

## API Signature

### Parameters

<PropertiesTable
  content={[
    {
      name: 'pre',
      type: 'Prediction',
      description: 'Object returned by the Replicate JavaScript SDK.',
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
    {
      name: 'options',
      type: '{ headers?: Record<string, string> }',
      isOptiona: true,
      description: 'An optional parameter for passing additional headers.',
    },
  ]}
/>

### Returns

A `ReadableStream` wrapped in a promise.
