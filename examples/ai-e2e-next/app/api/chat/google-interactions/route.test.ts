import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'test-api-key');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  const events = [
    {
      event_type: 'interaction.created',
      interaction: { id: 'new-interaction', status: 'in_progress' },
    },
    { event_type: 'step.start', index: 0, step: { type: 'model_output' } },
    {
      event_type: 'step.delta',
      index: 0,
      delta: { type: 'text', text: 'A safe reply' },
    },
    { event_type: 'step.stop', index: 0 },
    {
      event_type: 'interaction.completed',
      interaction: { id: 'new-interaction', status: 'completed' },
    },
  ];
  fetchMock.mockImplementation(
    async () =>
      new Response(
        events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''),
        {
          headers: { 'content-type': 'text/event-stream' },
        },
      ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Google Interactions chat route', () => {
  it.each([undefined, 'another-conversations-interaction'])(
    'sends full stateless history with client interaction ID %s',
    async interactionId => {
      const response = await POST(
        new Request('http://localhost:3000/api/chat/google-interactions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            messages: [
              {
                id: 'first-user',
                role: 'user',
                parts: [{ type: 'text', text: 'My name is Ada.' }],
              },
              {
                id: 'assistant',
                role: 'assistant',
                parts: [
                  {
                    type: 'text',
                    text: 'Hello Ada.',
                    providerMetadata: { google: { interactionId } },
                  },
                ],
              },
              {
                id: 'follow-up',
                role: 'user',
                parts: [{ type: 'text', text: 'What is my name?' }],
              },
            ],
          }),
        }),
      );

      expect(response.status).toBe(200);
      expect(await response.text()).toContain('A safe reply');
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(String(fetchMock.mock.calls[0][0])).toBe(
        'https://generativelanguage.googleapis.com/v1beta/interactions',
      );
      const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
      expect(body.previous_interaction_id).toBeUndefined();
      expect(body.store).toBe(false);
      expect(body.input).toEqual([
        {
          type: 'user_input',
          content: [{ type: 'text', text: 'My name is Ada.' }],
        },
        {
          type: 'model_output',
          content: [{ type: 'text', text: 'Hello Ada.' }],
        },
        {
          type: 'user_input',
          content: [{ type: 'text', text: 'What is my name?' }],
        },
      ]);
    },
  );
});
