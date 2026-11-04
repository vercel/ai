import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { expect, it } from 'vitest';
import { createGoogleVertex } from './google-vertex-provider-base';

it('omits provisional usage for a Vertex traffic-only first chunk', async () => {
  const chunks = [
    {
      responseId: 'vertex-response',
      usageMetadata: { trafficType: 'ON_DEMAND' },
      candidates: [{ content: { parts: [{ text: 'Hello' }], role: 'model' } }],
    },
    {
      responseId: 'vertex-response',
      usageMetadata: {
        promptTokenCount: 12,
        candidatesTokenCount: 1,
        totalTokenCount: 13,
      },
      candidates: [{ finishReason: 'STOP' }],
    },
  ];
  const provider = createGoogleVertex({
    project: 'test-project',
    location: 'us-central1',
    headers: { Authorization: 'Bearer test-token' },
    fetch: async () =>
      new Response(
        chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join(''),
        { headers: { 'content-type': 'text/event-stream' } },
      ),
  });
  const { stream } = await provider('gemini-2.5-flash').doStream({
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
  });
  const events = await convertReadableStreamToArray(stream);
  expect(events.filter(event => event.type === 'response-metadata')).toEqual([
    { type: 'response-metadata', id: 'vertex-response' },
  ]);
  expect(events.find(event => event.type === 'finish')).toMatchObject({
    usage: { inputTokens: { total: 12 }, outputTokens: { total: 1 } },
  });
});
