import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAnthropic } from './anthropic-provider';

const url = 'https://api.anthropic.com/v1/messages';
const server = createTestServer({ [url]: {} });
const model = createAnthropic({ apiKey: 'test-key' })('claude-sonnet-4-6');
const options: LanguageModelV4CallOptions = {
  prompt: [
    { role: 'system', content: 'Be concise.' },
    { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
  ],
  tools: [
    { type: 'function', name: 'weather', inputSchema: { type: 'object' } },
  ],
};

async function call(
  method: string,
  callOptions: LanguageModelV4CallOptions,
  targetModel = model,
  fixture = 'anthropic-text',
) {
  if (method === 'generate') {
    server.urls[url].response = {
      type: 'json-value',
      body: JSON.parse(
        fs.readFileSync(`src/__fixtures__/${fixture}.json`, 'utf8'),
      ),
    };
    return targetModel.doGenerate(callOptions);
  }
  server.urls[url].response = {
    type: 'stream-chunks',
    chunks: fs
      .readFileSync(`src/__fixtures__/${fixture}.chunks.txt`, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(chunk => `data: ${chunk}\n\n`),
  };
  return convertReadableStreamToArray(
    (await targetModel.doStream(callOptions)).stream,
  );
}

describe.each(['generate', 'stream'])('message threads (%s)', method => {
  it('creates a thread with system and tools and merges beta headers', async () => {
    const result = await call(method, {
      ...options,
      headers: { 'anthropic-beta': 'custom-beta' },
      providerOptions: { anthropic: { thread: { type: 'create' } } },
    });
    const body = await server.calls[0].requestBodyJson;
    expect(body.thread).toEqual({ type: 'create' });
    expect(body.system).toEqual([{ type: 'text', text: 'Be concise.' }]);
    expect(body.tools[0].name).toBe('weather');
    expect(server.calls[0].requestHeaders['anthropic-beta'].split(',')).toEqual(
      expect.arrayContaining(['message-threads-2026-08-12', 'custom-beta']),
    );
    if (Array.isArray(result)) {
      expect(result).toContainEqual(
        expect.objectContaining({
          type: 'response-metadata',
          id: 'msg_01QC4g3HwBThD4BaNtBckFDJ',
        }),
      );
      expect(result).toContainEqual(
        expect.objectContaining({ type: 'finish' }),
      );
    } else {
      expect(result.response?.id).toBe('msg_01VdEjxAP5ahtHKrrRdNBteQ');
    }
  });

  it('continues with only supplied messages, omitting system and tools', async () => {
    await call(method, {
      ...options,
      toolChoice: { type: 'auto' },
      providerOptions: {
        anthropic: {
          thread: { type: 'continue', previousMessageId: 'msg_previous' },
          cacheControl: { type: 'ephemeral' },
        },
      },
    });
    const body = await server.calls[0].requestBodyJson;
    expect(body.thread).toEqual({
      type: 'continue',
      previous_message_id: 'msg_previous',
    });
    expect(body).not.toHaveProperty('system');
    expect(body).not.toHaveProperty('tools');
    expect(body.messages).toEqual([options.prompt[1]]);
    expect(body.tool_choice).toEqual({ type: 'auto' });
    expect(body.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('sends tool results without resending the preceding assistant message', async () => {
    await call(method, {
      ...options,
      prompt: [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'tool_1',
              toolName: 'weather',
              output: { type: 'text', value: 'Sunny' },
            },
          ],
        },
      ],
      providerOptions: {
        anthropic: {
          thread: { type: 'continue', previousMessageId: 'msg_tools' },
        },
      },
    });
    expect((await server.calls[0].requestBodyJson).messages).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tool_1',
            content: 'Sunny',
          },
        ],
      },
    ]);
  });

  it('keeps pinned PDF beta headers across a text-only continuation', async () => {
    const anthropicBeta = ['pdfs-2024-09-25'];
    const first = await call(method, {
      prompt: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: { type: 'data', data: new Uint8Array([1]) },
              mediaType: 'application/pdf',
            },
          ],
        },
      ],
      providerOptions: {
        anthropic: { thread: { type: 'create' }, anthropicBeta },
      },
    });
    await call(method, {
      prompt: [options.prompt[1]],
      providerOptions: {
        anthropic: {
          thread: { type: 'continue', previousMessageId: 'msg_pdf' },
          anthropicBeta,
        },
      },
    });
    expect(server.calls[0].requestHeaders['anthropic-beta']).toBe(
      server.calls[1].requestHeaders['anthropic-beta'],
    );
    const warnings = Array.isArray(first)
      ? first.find(part => part.type === 'stream-start')?.warnings
      : first.warnings;
    expect(warnings).toEqual([]);
  });

  it('warns when message content enables an unpinned beta', async () => {
    const result = await call(method, {
      prompt: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: { type: 'data', data: new Uint8Array([1]) },
              mediaType: 'application/pdf',
            },
          ],
        },
      ],
      providerOptions: { anthropic: { thread: { type: 'create' } } },
    });
    const warnings = Array.isArray(result)
      ? result.find(part => part.type === 'stream-start')?.warnings
      : result.warnings;
    expect(warnings).toContainEqual(
      expect.objectContaining({
        details: expect.stringContaining('pdfs-2024-09-25'),
      }),
    );
  });

  it('warns rather than silently dropping new leading system instructions', async () => {
    const result = await call(method, {
      ...options,
      providerOptions: {
        anthropic: {
          thread: { type: 'continue', previousMessageId: 'msg_previous' },
        },
      },
    });
    const warnings = Array.isArray(result)
      ? result.find(part => part.type === 'stream-start')?.warnings
      : result.warnings;
    expect(warnings).toContainEqual(
      expect.objectContaining({
        details: expect.stringContaining(
          'To change system instructions or tools, start a new thread',
        ),
      }),
    );
  });

  it('keeps implicit code execution dynamic for web tools on continuation', async () => {
    const result = await call(
      method,
      {
        prompt: [options.prompt[1]],
        tools: [
          {
            type: 'provider',
            id: 'anthropic.web_search_20260209',
            name: 'research',
            args: {},
          },
        ],
        providerOptions: {
          anthropic: {
            thread: { type: 'continue', previousMessageId: 'msg_web' },
          },
        },
      },
      model,
      'anthropic-programmatic-tool-calling.1',
    );
    const content = Array.isArray(result) ? result : result.content;
    expect(content).toContainEqual(
      expect.objectContaining({
        type: 'tool-call',
        toolName: 'code_execution',
        dynamic: true,
      }),
    );
    expect(await server.calls[0].requestBodyJson).not.toHaveProperty('tools');
  });

  it('supports a custom provider-options namespace', async () => {
    await call(
      method,
      {
        prompt: [options.prompt[1]],
        providerOptions: {
          custom: {
            thread: { type: 'continue', previousMessageId: 'msg_custom' },
          },
        },
      },
      createAnthropic({ apiKey: 'test-key', name: 'custom.messages' })(
        'claude-sonnet-4-6',
      ),
    );
    expect((await server.calls[0].requestBodyJson).thread).toEqual({
      type: 'continue',
      previous_message_id: 'msg_custom',
    });
  });

  it('retains JSON-tool choice while omitting its synthetic definition', async () => {
    await call(method, {
      prompt: [options.prompt[1]],
      responseFormat: {
        type: 'json',
        schema: { type: 'object', properties: {} },
      },
      providerOptions: {
        anthropic: {
          structuredOutputMode: 'jsonTool',
          thread: { type: 'continue', previousMessageId: 'msg_json' },
        },
      },
    });
    const body = await server.calls[0].requestBodyJson;
    expect(body).not.toHaveProperty('tools');
    expect(body.tool_choice).toMatchObject({ type: 'any' });
  });

  it('allows empty continuation messages for pause_turn', async () => {
    await call(method, {
      prompt: [],
      providerOptions: {
        anthropic: {
          thread: { type: 'continue', previousMessageId: 'msg_paused' },
        },
      },
    });
    expect((await server.calls[0].requestBodyJson).messages).toEqual([]);
  });

  it('leaves requests unchanged when threads are not enabled', async () => {
    await call(method, options);
    expect(await server.calls[0].requestBodyJson).not.toHaveProperty('thread');
    expect(server.calls[0].requestHeaders['anthropic-beta']).not.toContain(
      'message-threads',
    );
  });

  it.each([
    { compaction: { type: 'summarize' } },
    { contextManagement: { edits: [{ type: 'clear_tool_uses_20250919' }] } },
    { contextManagement: { edits: [{ type: 'clear_thinking_20251015' }] } },
    { contextManagement: { edits: [{ type: 'compact_20260112' }] } },
  ])('rejects unsupported context management: %j', async incompatible => {
    await expect(
      call(method, {
        ...options,
        providerOptions: {
          anthropic: { ...incompatible, thread: { type: 'create' } },
        },
      }),
    ).rejects.toThrow('message threads do not support');
    expect(server.calls).toHaveLength(0);
  });

  it('allows keeping all thinking blocks', async () => {
    await call(method, {
      ...options,
      providerOptions: {
        anthropic: {
          thread: { type: 'create' },
          contextManagement: {
            edits: [{ type: 'clear_thinking_20251015', keep: 'all' }],
          },
        },
      },
    });
    expect((await server.calls[0].requestBodyJson).context_management).toEqual({
      edits: [{ type: 'clear_thinking_20251015', keep: 'all' }],
    });
  });

  it.each([
    { type: 'continue' },
    { type: 'continue', previousMessageId: '' },
    { type: 'invalid' },
  ])('rejects invalid thread options: %j', async thread => {
    await expect(
      call(method, { ...options, providerOptions: { anthropic: { thread } } }),
    ).rejects.toThrow();
    expect(server.calls).toHaveLength(0);
  });
});

describe('thread errors', () => {
  it.each(['generate', 'stream'])(
    'preserves recovery details for %s',
    async method => {
      const model = createAnthropic({
        apiKey: 'test-key',
        fetch: async () =>
          new Response(
            JSON.stringify({
              type: 'error',
              error: {
                type: 'not_found_error',
                message: 'Thread not found',
                details: { error_code: 'thread_not_found' },
              },
            }),
            { status: 404, headers: { 'content-type': 'application/json' } },
          ),
      })('claude-sonnet-4-6');
      const input = {
        ...options,
        providerOptions: {
          anthropic: {
            thread: { type: 'continue', previousMessageId: 'msg_expired' },
          },
        },
      };
      await expect(
        method === 'generate' ? model.doGenerate(input) : model.doStream(input),
      ).rejects.toMatchObject({
        statusCode: 404,
        data: { error: { details: { error_code: 'thread_not_found' } } },
      });
    },
  );
});
