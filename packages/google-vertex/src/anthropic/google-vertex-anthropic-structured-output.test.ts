import { createAnthropic } from '@ai-sdk/anthropic';
import { sanitizeJsonSchema } from '@ai-sdk/anthropic/internal';
import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
} from '@ai-sdk/provider';
import { asSchema, type FetchFunction } from '@ai-sdk/provider-utils';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { createGoogleVertexAnthropic } from './google-vertex-anthropic-provider';
import { createGoogleVertexAnthropic as createNodeProvider } from './google-vertex-anthropic-provider-node';
import { createGoogleVertexAnthropic as createEdgeProvider } from './edge/google-vertex-anthropic-provider-edge';

// Same schema shape as humanize-app/ai-gateway-vertex-schema-repro.
// Deliberately off-schema mock replies characterize SDK parsing, not provider conformance.
const reportSchema = z.object({
  overview: z.object({ goals: z.string(), participants: z.string() }),
  findings: z
    .array(
      z.object({
        title: z.string(),
        summary: z.string(),
        objectiveIndexes: z.array(z.number().min(0)).min(1),
        fragments: z.array(
          z.object({ marker: z.string(), themeName: z.string().nullable() }),
        ),
      }),
    )
    .min(1),
});
const report = {
  overview: { goals: 'Test timers', participants: 'Home cooks' },
  findings: [
    {
      title: 'Clear controls',
      summary: 'Timers are easy to start',
      objectiveIndexes: [0],
      fragments: [{ marker: 'A', themeName: null }],
    },
  ],
};
const prompt: LanguageModelV4CallOptions['prompt'] = [
  { role: 'user', content: [{ type: 'text', text: 'Invent a timer report.' }] },
];
const cases = (['vertex', 'vertex-opt-in', 'anthropic'] as const).flatMap(
  provider =>
    (['auto', 'jsonTool', 'outputFormat'] as const).flatMap(mode =>
      [false, true].map(wrapped => ({ provider, mode, wrapped })),
    ),
);

describe.each(['generate', 'stream'] as const)(
  'Vertex Anthropic structured output: %s',
  method => {
    it.each(cases)(
      '$provider $mode preserves the schema and returned arguments (wrapped: $wrapped)',
      async ({ provider, mode, wrapped }) => {
        const schema = await asSchema(reportSchema).jsonSchema;
        const native =
          mode === 'outputFormat' || (provider !== 'vertex' && mode === 'auto');
        const value = wrapped ? { input: JSON.stringify(report) } : report;
        const text = JSON.stringify(value);
        const fetch = vi.fn<FetchFunction>(async () =>
          createResponse(method, native, value),
        );
        const model =
          provider !== 'anthropic'
            ? createGoogleVertexAnthropic({
                project: 'test-project',
                location: 'us-east5',
                supportsNativeStructuredOutput: provider === 'vertex-opt-in',
                fetch,
              })('claude-opus-5')
            : createAnthropic({ apiKey: 'test-key', fetch })('claude-opus-5');
        const options: LanguageModelV4CallOptions = {
          prompt,
          responseFormat: { type: 'json', schema },
          providerOptions: { anthropic: { structuredOutputMode: mode } },
        };

        if (method === 'generate') {
          const result = await model.doGenerate(options);
          expect(result.content).toEqual([{ type: 'text', text }]);
          expect(result.finishReason.unified).toBe('stop');
        } else {
          const result = await model.doStream(options);
          const chunks = await convertReadableStreamToArray(result.stream);
          expect(chunks.some(chunk => chunk.type === 'error')).toBe(false);
          expect(
            chunks
              .filter(chunk => chunk.type === 'text-delta')
              .map(chunk => chunk.delta)
              .join(''),
          ).toBe(text);
          expect(chunks.find(chunk => chunk.type === 'finish')).toMatchObject({
            finishReason: { unified: 'stop' },
          });
        }

        const request = JSON.parse(fetch.mock.calls[0][1]!.body as string);
        if (native) {
          expect(request.output_config.format).toEqual({
            type: 'json_schema',
            schema: sanitizeJsonSchema(schema),
          });
          expect(request.tools).toBeUndefined();
          expect(
            new Headers(fetch.mock.calls[0][1]!.headers).get('anthropic-beta'),
          ).toBeNull();
        } else {
          expect(request.output_config).toBeUndefined();
          expect(request.tools).toEqual([
            {
              name: 'json',
              description: 'Respond with a JSON object.',
              input_schema: schema,
              ...(method === 'stream' ? { eager_input_streaming: true } : {}),
            },
          ]);
          expect(request.tool_choice).toEqual({
            type: 'any',
            disable_parallel_tool_use: true,
          });
        }
        if (provider !== 'anthropic') {
          expect(request.anthropic_version).toBe('vertex-2023-10-16');
          expect(request.model).toBeUndefined();
        }
        expect(reportSchema.safeParse(value).success).toBe(!wrapped);
      },
    );
  },
);

it.each(['generate', 'stream'] as const)(
  'does not retry a native-output policy rejection with tool emulation: %s',
  async method => {
    const message =
      'Organization Policy constraint constraints/vertexai.allowedPartnerModelFeatures violated: structured_outputs is disallowed.';
    const fetch = vi.fn<FetchFunction>(async () =>
      Response.json(
        { type: 'error', error: { type: 'invalid_request_error', message } },
        { status: 400 },
      ),
    );
    const model = createGoogleVertexAnthropic({
      project: 'test-project',
      location: 'us-east5',
      supportsNativeStructuredOutput: true,
      fetch,
    })('claude-opus-5');
    const options: LanguageModelV4CallOptions = {
      prompt,
      responseFormat: {
        type: 'json',
        schema: await asSchema(reportSchema).jsonSchema,
      },
    };

    await expect(
      method === 'generate'
        ? model.doGenerate(options)
        : model.doStream(options),
    ).rejects.toMatchObject({ statusCode: 400, message, isRetryable: false });
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);

describe.each([
  ['Node', createNodeProvider],
  ['Edge', createEdgeProvider],
] as const)('%s native-output opt-in', (_runtime, createProvider) => {
  it.each(['generate', 'stream'] as const)(
    'uses native output by default without a request override: %s',
    async method => {
      const fetch = vi.fn<FetchFunction>(async () =>
        createResponse(method, true, report),
      );
      const model = createProvider({
        project: 'test-project',
        location: 'us-east5',
        supportsNativeStructuredOutput: true,
        generateAuthToken: async () => 'test-token',
        fetch,
      })('claude-sonnet-4-6');

      await call(model, method, {
        prompt,
        responseFormat: {
          type: 'json',
          schema: await asSchema(reportSchema).jsonSchema,
        },
      });

      const request = JSON.parse(fetch.mock.calls[0][1]!.body as string);
      expect(request.output_config.format.type).toBe('json_schema');
      expect(request.tools).toBeUndefined();
      const headers = new Headers(fetch.mock.calls[0][1]!.headers);
      expect(headers.get('authorization')).toBe('Bearer test-token');
      expect(headers.get('anthropic-beta')).toBeNull();
    },
  );

  describe.each(['generate', 'stream'] as const)('%s tools', method => {
    it.each([false, true])(
      'preserves tool input schemas and arguments without enabling strict tools (native final output: %s)',
      async withOutput => {
        const value = { input: JSON.stringify(report) };
        const schema = await asSchema(reportSchema).jsonSchema;
        const fetch = vi.fn<FetchFunction>(async () =>
          createResponse(method, false, value, 'report'),
        );
        const model = createProvider({
          project: 'test-project',
          location: 'us-east5',
          supportsNativeStructuredOutput: true,
          generateAuthToken: async () => 'test-token',
          fetch,
        })('claude-sonnet-4-6');

        const result = await call(model, method, {
          prompt,
          ...(withOutput
            ? { responseFormat: { type: 'json' as const, schema } }
            : {}),
          tools: [
            {
              type: 'function',
              name: 'report',
              inputSchema: schema,
              strict: true,
            },
          ],
        });

        const request = JSON.parse(fetch.mock.calls[0][1]!.body as string);
        expect(request.tools).toEqual([
          {
            name: 'report',
            input_schema: schema,
            ...(method === 'stream' ? { eager_input_streaming: true } : {}),
          },
        ]);
        expect(request.output_config?.format).toEqual(
          withOutput
            ? { type: 'json_schema', schema: sanitizeJsonSchema(schema) }
            : undefined,
        );
        expect(
          new Headers(fetch.mock.calls[0][1]!.headers).get('anthropic-beta'),
        ).toBeNull();
        expect(result.find(part => part.type === 'tool-call')).toMatchObject({
          toolName: 'report',
          input: JSON.stringify(value),
        });
        expect(reportSchema.safeParse(value).success).toBe(false);
      },
    );
  });
});

async function call(
  model: LanguageModelV4,
  method: 'generate' | 'stream',
  options: LanguageModelV4CallOptions,
) {
  if (method === 'generate') {
    return (await model.doGenerate(options)).content;
  }
  const result = await model.doStream(options);
  const chunks = await convertReadableStreamToArray(result.stream);
  expect(chunks.some(chunk => chunk.type === 'error')).toBe(false);
  return chunks;
}

function createResponse(
  method: 'generate' | 'stream',
  native: boolean,
  value: unknown,
  toolName = 'json',
): Response {
  const text = JSON.stringify(value);
  const contentBlock = native
    ? { type: 'text', text }
    : { type: 'tool_use', id: 'tool-1', name: toolName, input: value };
  const message = {
    id: 'msg-1',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5',
    content: [contentBlock],
    stop_reason: native ? 'end_turn' : 'tool_use',
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  };
  if (method === 'generate') {
    return Response.json(message);
  }

  const events = [
    {
      type: 'message_start',
      message: { ...message, content: [], stop_reason: null },
    },
    {
      type: 'content_block_start',
      index: 0,
      content_block: native
        ? { type: 'text', text: '' }
        : { ...contentBlock, input: {} },
    },
    ...['', text.slice(0, 13), text.slice(13)].map(delta => ({
      type: 'content_block_delta',
      index: 0,
      delta: native
        ? { type: 'text_delta', text: delta }
        : { type: 'input_json_delta', partial_json: delta },
    })),
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: {
        stop_reason: message.stop_reason,
        stop_sequence: null,
      },
      usage: { output_tokens: 1 },
    },
    { type: 'message_stop' },
  ];
  return new Response(
    events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''),
    { headers: { 'content-type': 'text/event-stream' } },
  );
}
