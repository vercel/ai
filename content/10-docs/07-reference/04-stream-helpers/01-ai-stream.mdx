---
title: AIStream
description: Learn to use AIStream helper function in your application.
---

# `AIStream`

<Note type="warning">
  AIStream has been removed in AI SDK 4.0. Use
  `streamText.toDataStreamResponse()` instead.
</Note>

Creates a readable stream for AI responses. This is based on the responses returned
by fetch and serves as the basis for the OpenAIStream and AnthropicStream. It allows
you to handle AI response streams in a controlled and customized manner that will
work with useChat and useCompletion.

AIStream will throw an error if response doesn't have a 2xx status code. This is to ensure that the stream is only created for successful responses.

## Import

### React

<Snippet text={`import { AIStream } from "ai"`} prompt={false} />

## API Signature

<PropertiesTable
  content={[
    {
      name: 'response',
      type: 'Response',
      description:
        "This is the response object returned by fetch. It's used as the source of the readable stream.",
    },
    {
      name: 'customParser',
      type: '(AIStreamParser) => void',
      description:
        'This is a function that is used to parse the events in the stream. It should return a function that receives a stringified chunk from the LLM and extracts the message content. The function is expected to return nothing (void) or a string.',
      properties: [
        {
          type: 'AIStreamParser',
          parameters: [
            {
              name: '',
              type: '(data: string) => string | void',
            },
          ],
        },
      ],
    },
    {
      name: 'callbacks',
      type: 'AIStreamCallbacksAndOptions',
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
