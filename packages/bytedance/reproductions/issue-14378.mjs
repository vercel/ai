import assert from 'node:assert/strict';
import { createByteDance } from '../dist/index.js';

const calls = [];

const bytedance = createByteDance({
  apiKey: 'test-api-key',
  baseURL: 'https://example.test/api/v3',
  fetch: async (url, init) => {
    const bodyText = init?.body == null ? undefined : String(init.body);
    calls.push({
      url: String(url),
      method: init?.method,
      body: bodyText == null ? undefined : JSON.parse(bodyText),
    });

    if (String(url).endsWith('/contents/generations/tasks')) {
      return new Response(JSON.stringify({ id: 'task-14378' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (String(url).endsWith('/contents/generations/tasks/task-14378')) {
      return new Response(
        JSON.stringify({
          id: 'task-14378',
          status: 'succeeded',
          content: { video_url: 'https://example.test/video.mp4' },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    }

    throw new Error(`Unexpected request URL: ${url}`);
  },
});

await bytedance.video('seedance-1-5-pro-251215').doGenerate({
  prompt: 'Animate this start and end frame.',
  n: 1,
  aspectRatio: undefined,
  duration: undefined,
  fps: undefined,
  resolution: undefined,
  seed: undefined,
  generateAudio: undefined,
  abortSignal: undefined,
  headers: undefined,
  providerOptions: undefined,
  warnings: [],
  image: undefined,
  frameImages: [
    {
      frameType: 'first_frame',
      image: { type: 'url', url: 'https://example.test/first-frame.png' },
    },
    {
      frameType: 'last_frame',
      image: { type: 'url', url: 'https://example.test/last-frame.png' },
    },
  ],
  inputReferences: undefined,
});

assert.equal(calls.length, 2, 'expected create-task and poll requests');

const requestBody = calls[0].body;

assert.deepEqual(requestBody.content, [
  {
    type: 'text',
    text: 'Animate this start and end frame.',
  },
  {
    type: 'image_url',
    image_url: { url: 'https://example.test/first-frame.png' },
    role: 'first_frame',
  },
  {
    type: 'image_url',
    image_url: { url: 'https://example.test/last-frame.png' },
    role: 'last_frame',
  },
]);

console.log(
  'Issue #14378 scenario worked: first-and-last frame request includes role:first_frame and role:last_frame.',
);
