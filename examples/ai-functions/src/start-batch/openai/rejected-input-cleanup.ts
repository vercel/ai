import { strict as assert } from 'node:assert';
import { createOpenAI } from '@ai-sdk/openai';
import { experimental_startBatch as startBatch } from 'ai';

const calls: Array<{ method: string; path: string }> = [];

const provider = createOpenAI({
  apiKey: 'synthetic',
  fetch: async (url, init) => {
    const path = new URL(url instanceof Request ? url.url : url).pathname;
    const method = init?.method ?? 'GET';
    calls.push({ method, path });

    if (path === '/v1/files' && method === 'POST') {
      return Response.json({
        id: 'file-synthetic',
        object: 'file',
        filename: 'batch.jsonl',
        purpose: 'batch',
      });
    }

    if (path === '/v1/batches' && method === 'POST') {
      return Response.json(
        {
          error: {
            message: 'Invalid batch',
            type: 'invalid_request_error',
            code: 'invalid_request',
          },
        },
        { status: 400 },
      );
    }

    if (path === '/v1/files/file-synthetic' && method === 'DELETE') {
      return Response.json({
        id: 'file-synthetic',
        object: 'file',
        deleted: true,
      });
    }

    throw new Error(`Unexpected request: ${method} ${path}`);
  },
});

await assert.rejects(
  startBatch({
    provider,
    requests: [
      {
        id: 'request-1',
        type: 'text',
        model: 'gpt-5.4-nano',
        prompt: 'Hello',
      },
    ],
  }),
  /Invalid batch/,
);

assert.deepEqual(calls, [
  { method: 'POST', path: '/v1/files' },
  { method: 'POST', path: '/v1/batches' },
  { method: 'DELETE', path: '/v1/files/file-synthetic' },
]);

console.log('Rejected batch input file was deleted.');
