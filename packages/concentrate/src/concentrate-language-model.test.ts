import { describe, expect, it, vi } from 'vitest';
import { createConcentrate } from './concentrate-provider';

const response = {
  id: 'resp_test',
  object: 'response',
  created_at: 1_700_000_000,
  status: 'completed',
  model: 'gpt-5.2',
  output: [
    {
      type: 'message',
      id: 'msg_test',
      role: 'assistant',
      content: [{ type: 'output_text', text: 'Hello from Concentrate.' }],
    },
  ],
  usage: {
    input_tokens: 3,
    output_tokens: 4,
    total_tokens: 7,
  },
};

describe('Concentrate Responses model', () => {
  it('sends a Responses request and parses the response', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const model = createConcentrate({ apiKey: 'test-key', fetch })('gpt-5.2');

    const result = await model.doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
    });

    expect(result.content).toEqual([
      expect.objectContaining({
        type: 'text',
        text: 'Hello from Concentrate.',
      }),
    ]);
    expect(fetch).toHaveBeenCalledWith(
      'https://api.concentrate.ai/v1/responses',
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer test-key',
        }),
      }),
    );

    const request = fetch.mock.calls[0][1];
    expect(JSON.parse(request.body)).toMatchObject({
      model: 'gpt-5.2',
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'Hi' }] }],
    });
  });
});

describe('Concentrate Chat model', () => {
  it('uses the Chat Completions endpoint explicitly', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'chatcmpl_test',
          model: 'gpt-5.2',
          choices: [
            {
              message: { role: 'assistant', content: 'Hello from Chat.' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const model = createConcentrate({ apiKey: 'test-key', fetch }).chat(
      'gpt-5.2',
    );

    const result = await model.doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
    });

    expect(result.content).toEqual([
      { type: 'text', text: 'Hello from Chat.' },
    ]);
    expect(fetch.mock.calls[0][0]).toBe(
      'https://api.concentrate.ai/v1/chat/completions',
    );
  });
});
