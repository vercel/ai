import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { POST as agenticVideoPOST } from '../google-interactions-agentic-video/route';

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

describe.each([
  ['Google Interactions', POST, false],
  ['Google Interactions agentic video', agenticVideoPOST, true],
] as const)('%s chat route', (_name, handler, agenticVideo) => {
  it.each([undefined, 'another-conversations-interaction'])(
    'sends full stateless history with client interaction ID %s',
    async interactionId => {
      const response = await handler(
        new Request('http://localhost:3000/api/chat/google-interactions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            messages: [
              {
                id: 'first-user',
                role: 'user',
                parts: [
                  ...(agenticVideo
                    ? [
                        {
                          type: 'file',
                          mediaType: 'video/mp4',
                          url: 'data:video/mp4;base64,AQID',
                        },
                      ]
                    : []),
                  { type: 'text', text: 'My name is Ada.' },
                ],
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
                  ...(agenticVideo
                    ? [
                        {
                          type: 'custom',
                          kind: 'google.processing_call',
                          providerMetadata: {
                            google: { processingId: 'video-processing' },
                          },
                        },
                        {
                          type: 'custom',
                          kind: 'google.processing_result',
                          providerMetadata: {
                            google: { processingCallId: 'video-processing' },
                          },
                        },
                      ]
                    : []),
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
          content: [
            ...(agenticVideo
              ? [
                  {
                    type: 'video',
                    data: 'AQID',
                    mime_type: 'video/mp4',
                    processing: 'agentic',
                  },
                ]
              : []),
            { type: 'text', text: 'My name is Ada.' },
          ],
        },
        {
          type: 'model_output',
          content: [{ type: 'text', text: 'Hello Ada.' }],
        },
        ...(agenticVideo
          ? [
              { type: 'processing_call', id: 'video-processing' },
              { type: 'processing_result', call_id: 'video-processing' },
            ]
          : []),
        {
          type: 'user_input',
          content: [{ type: 'text', text: 'What is my name?' }],
        },
      ]);
    },
  );
});
