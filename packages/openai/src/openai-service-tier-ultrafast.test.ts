import { describe, expect, it } from 'vitest';
import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { createOpenAI } from './openai-provider';

const prompt: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

function successfulChatResponse(model: string) {
  return {
    id: 'chatcmpl_test',
    object: 'chat.completion',
    created: 1,
    model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: 'ok' },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 1,
      completion_tokens: 1,
      total_tokens: 2,
    },
  };
}

function successfulResponsesResponse(model: string) {
  return {
    id: 'resp_test',
    object: 'response',
    created_at: 1,
    status: 'completed',
    model,
    output: [
      {
        id: 'msg_test',
        type: 'message',
        status: 'completed',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'ok' }],
      },
    ],
    usage: {
      input_tokens: 1,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 1,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 2,
    },
  };
}

function sseChatChunk(model: string) {
  return [
    `data: ${JSON.stringify({
      id: 'chatcmpl_test',
      object: 'chat.completion.chunk',
      created: 1,
      model,
      choices: [
        {
          index: 0,
          delta: { role: 'assistant', content: 'ok' },
          finish_reason: null,
        },
      ],
    })}\n\n`,
    `data: ${JSON.stringify({
      id: 'chatcmpl_test',
      object: 'chat.completion.chunk',
      created: 1,
      model,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    })}\n\n`,
    'data: [DONE]\n\n',
  ].join('');
}

describe('OpenAI serviceTier ultrafast', () => {
  it('sends service_tier ultrafast on Chat Completions for gpt-5.6-sol', async () => {
    let requestBody: { service_tier?: string; model?: string } | undefined;

    const provider = createOpenAI({
      apiKey: 'test-api-key',
      fetch: async (_input, init) => {
        requestBody = JSON.parse(String(init?.body));
        return Response.json(successfulChatResponse(requestBody!.model!));
      },
    });

    const result = await provider.chat('gpt-5.6-sol').doGenerate({
      prompt,
      providerOptions: {
        openai: {
          serviceTier: 'ultrafast',
        },
      },
    });

    expect(requestBody).toMatchObject({
      model: 'gpt-5.6-sol',
      service_tier: 'ultrafast',
    });
    expect(result.warnings).toEqual([]);
  });

  it('sends service_tier ultrafast on Chat Completions streaming', async () => {
    let requestBody:
      | { service_tier?: string; model?: string; stream?: boolean }
      | undefined;

    const provider = createOpenAI({
      apiKey: 'test-api-key',
      fetch: async (_input, init) => {
        requestBody = JSON.parse(String(init?.body));
        return new Response(sseChatChunk(requestBody!.model!), {
          headers: { 'Content-Type': 'text/event-stream' },
        });
      },
    });

    await provider.chat('gpt-5.6-sol').doStream({
      prompt,
      providerOptions: {
        openai: {
          serviceTier: 'ultrafast',
        },
      },
    });

    expect(requestBody).toMatchObject({
      model: 'gpt-5.6-sol',
      service_tier: 'ultrafast',
      stream: true,
    });
  });

  it('sends service_tier ultrafast on Responses for gpt-5.6-sol', async () => {
    let requestBody: { service_tier?: string; model?: string } | undefined;

    const provider = createOpenAI({
      apiKey: 'test-api-key',
      fetch: async (_input, init) => {
        requestBody = JSON.parse(String(init?.body));
        return Response.json(successfulResponsesResponse(requestBody!.model!));
      },
    });

    const result = await provider.responses('gpt-5.6-sol').doGenerate({
      prompt,
      providerOptions: {
        openai: {
          serviceTier: 'ultrafast',
        },
      },
    });

    expect(requestBody).toMatchObject({
      model: 'gpt-5.6-sol',
      service_tier: 'ultrafast',
    });
    expect(result.warnings).toEqual([]);
  });

  it('does not gate ultrafast on priority-processing support', async () => {
    let requestBody: { service_tier?: string } | undefined;

    const provider = createOpenAI({
      apiKey: 'test-api-key',
      fetch: async (_input, init) => {
        requestBody = JSON.parse(String(init?.body));
        return Response.json(successfulChatResponse('gpt-3.5-turbo'));
      },
    });

    const result = await provider.chat('gpt-3.5-turbo').doGenerate({
      prompt,
      providerOptions: {
        openai: {
          serviceTier: 'ultrafast',
        },
      },
    });

    expect(requestBody?.service_tier).toBe('ultrafast');
    expect(result.warnings).toEqual([]);
  });
});
