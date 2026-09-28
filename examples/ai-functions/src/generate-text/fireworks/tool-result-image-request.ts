import { createFireworks } from '@ai-sdk/fireworks';
import assert from 'node:assert/strict';

// Offline wire-format reproduction: no credentials or network calls are needed.
const image =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const model = createFireworks({
  apiKey: 'offline',
  fetch: async (_url, init) => {
    assert.equal(typeof init?.body, 'string');
    const request = JSON.parse(init?.body as string);
    assert.deepEqual(request.messages.at(-1), {
      role: 'tool',
      tool_call_id: 'call-image',
      content: [
        {
          type: 'image_url',
          image_url: { url: `data:image/png;base64,${image}` },
        },
      ],
    });
    console.log(
      'Tool image is structured image_url content. No request was sent.',
    );
    return Response.json({
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'ok' },
          finish_reason: 'stop',
        },
      ],
    });
  },
})('offline-model');

await model.doGenerate({
  prompt: [
    {
      role: 'user',
      content: [{ type: 'text', text: 'Describe the tool image.' }],
    },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: 'call-image',
          toolName: 'getImage',
          input: {},
        },
      ],
    },
    {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'call-image',
          toolName: 'getImage',
          output: {
            type: 'content',
            value: [
              {
                type: 'file',
                mediaType: 'image/png',
                data: { type: 'data', data: image },
              },
            ],
          },
        },
      ],
    },
  ],
});
