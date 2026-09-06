import { safeValidateTypes, type InferSchema } from '@ai-sdk/provider-utils';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  openaiResponsesChunkSchema,
  openaiResponsesResponseSchema,
} from './openai-responses-api';

/**
 * expectTypeOf is utilized to ensure that the required sections of openaiResponsesChunkSchema
 * and openaiResponsesResponseSchema are of the same type.
 */

describe('openaiResponses schema alignment', () => {
  type Chunk = InferSchema<typeof openaiResponsesChunkSchema>;
  type Response = InferSchema<typeof openaiResponsesResponseSchema>;

  it('matches annotation shape between chunk and response schemas', () => {
    type ChunkAnnotation = Extract<
      Chunk,
      { type: 'response.output_text.annotation.added' }
    >['annotation'];

    type ResponseAnnotation = Extract<
      NonNullable<Response['output']>[number],
      { type: 'message' }
    >['content'][number]['annotations'][number];

    expectTypeOf<ChunkAnnotation>().toEqualTypeOf<ResponseAnnotation>();
  });

  it('aligns web_search_call actions', () => {
    type ChunkWebSearchAction = Extract<
      Extract<Chunk, { type: 'response.output_item.done' }>['item'],
      { type: 'web_search_call' }
    >['action'];

    type ResponseWebSearchAction = Extract<
      NonNullable<Response['output']>[number],
      { type: 'web_search_call' }
    >['action'];

    expectTypeOf<ChunkWebSearchAction>().toEqualTypeOf<ResponseWebSearchAction>();
  });

  it('aligns code_interpreter outputs', () => {
    type ChunkCodeInterpreterOutputs = Extract<
      Extract<Chunk, { type: 'response.output_item.done' }>['item'],
      { type: 'code_interpreter_call' }
    >['outputs'];

    type ResponseCodeInterpreterOutputs = Extract<
      NonNullable<Response['output']>[number],
      { type: 'code_interpreter_call' }
    >['outputs'];

    expectTypeOf<ChunkCodeInterpreterOutputs>().toEqualTypeOf<ResponseCodeInterpreterOutputs>();
  });

  it('aligns file_search_call results', () => {
    type ChunkFileSearchResults = Extract<
      Extract<Chunk, { type: 'response.output_item.done' }>['item'],
      { type: 'file_search_call' }
    >['results'];

    type ResponseFileSearchResults = Extract<
      NonNullable<Response['output']>[number],
      { type: 'file_search_call' }
    >['results'];

    expectTypeOf<ChunkFileSearchResults>().toEqualTypeOf<ResponseFileSearchResults>();
  });

  it('aligns message phase between added chunk, done chunk, and response schemas', () => {
    type AddedChunkPhase = Extract<
      Extract<Chunk, { type: 'response.output_item.added' }>['item'],
      { type: 'message' }
    >['phase'];

    type DoneChunkPhase = Extract<
      Extract<Chunk, { type: 'response.output_item.done' }>['item'],
      { type: 'message' }
    >['phase'];

    type ResponsePhase = Extract<
      NonNullable<Response['output']>[number],
      { type: 'message' }
    >['phase'];

    expectTypeOf<AddedChunkPhase>().toEqualTypeOf<DoneChunkPhase>();
    expectTypeOf<DoneChunkPhase>().toEqualTypeOf<ResponsePhase>();
  });

  it('aligns output_text logprobs', () => {
    type ChunkLogprobs = Extract<
      Chunk,
      { type: 'response.output_text.delta' }
    >['logprobs'];

    type ResponseLogprobs = Extract<
      Extract<
        NonNullable<Response['output']>[number],
        { type: 'message' }
      >['content'][number],
      { type: 'output_text' }
    >['logprobs'];

    expectTypeOf<ChunkLogprobs>().toEqualTypeOf<ResponseLogprobs>();
  });

  it('aligns local_shell_call between added, done, and response schemas', () => {
    type AddedLocalShellCall = Extract<
      Extract<Chunk, { type: 'response.output_item.added' }>['item'],
      { type: 'local_shell_call' }
    >;

    type DoneLocalShellCall = Extract<
      Extract<Chunk, { type: 'response.output_item.done' }>['item'],
      { type: 'local_shell_call' }
    >;

    type ResponseLocalShellCall = Extract<
      NonNullable<Response['output']>[number],
      { type: 'local_shell_call' }
    >;

    expectTypeOf<AddedLocalShellCall>().toEqualTypeOf<DoneLocalShellCall>();
    expectTypeOf<DoneLocalShellCall>().toEqualTypeOf<ResponseLocalShellCall>();
  });
});

describe('openaiResponsesChunkSchema', () => {
  describe.each([
    'response.output_item.added',
    'response.output_item.done',
  ] as const)('%s', type => {
    it.each([
      { name: 'missing item', itemProperty: {} },
      { name: 'null item', itemProperty: { item: null } },
      { name: 'non-object item', itemProperty: { item: 'invalid' } },
      { name: 'type-less item', itemProperty: { item: { id: 'item_1' } } },
    ])('rejects events with $name', async ({ itemProperty }) => {
      const result = await safeValidateTypes({
        value: {
          type,
          output_index: 0,
          ...itemProperty,
        },
        schema: openaiResponsesChunkSchema,
      });

      expect(result.success).toBe(false);
    });
  });

  it.each(['response.output_item.added', 'response.output_item.done'] as const)(
    'keeps future item types forward compatible for %s',
    async type => {
      const result = await safeValidateTypes({
        value: {
          type,
          output_index: 0,
          item: { id: 'item_1', type: 'future_output_item' },
        },
        schema: openaiResponsesChunkSchema,
      });

      expect(result).toMatchObject({
        success: true,
        value: {
          type: 'unknown_chunk',
          message: type,
        },
      });
    },
  );

  describe.each([
    'response.output_item.added',
    'response.output_item.done',
  ] as const)('%s local_shell_call', type => {
    const item = {
      id: 'item_1',
      type: 'local_shell_call',
      call_id: 'call_1',
      status:
        type === 'response.output_item.added' ? 'in_progress' : 'completed',
      action: {
        type: 'exec',
        command: ['ls'],
        env: {},
      },
    };

    it('accepts valid events', async () => {
      const result = await safeValidateTypes({
        value: {
          type,
          output_index: 0,
          item,
        },
        schema: openaiResponsesChunkSchema,
      });

      expect(result).toMatchObject({
        success: true,
        value: {
          type,
          item: { type: 'local_shell_call' },
        },
      });
    });

    it('rejects events without output_index', async () => {
      const result = await safeValidateTypes({
        value: { type, item },
        schema: openaiResponsesChunkSchema,
      });

      expect(result.success).toBe(false);
    });
  });

  it('accepts valid function call arguments done events', async () => {
    const event = {
      type: 'response.function_call_arguments.done',
      item_id: 'item_1',
      output_index: 0,
      arguments: '{"city":"Berlin"}',
    };

    const result = await safeValidateTypes({
      value: event,
      schema: openaiResponsesChunkSchema,
    });

    expect(result).toMatchObject({
      success: true,
      value: event,
    });
  });

  it('rejects malformed function call arguments done events', async () => {
    const result = await safeValidateTypes({
      value: {
        type: 'response.function_call_arguments.done',
        item_id: 'item_1',
        arguments: '{"city":"Berlin"}',
      },
      schema: openaiResponsesChunkSchema,
    });

    expect(result.success).toBe(false);
  });

  describe.each(['response.completed', 'response.incomplete'] as const)(
    '%s',
    type => {
      it.each([
        { name: 'missing usage', response: {} },
        {
          name: 'null usage',
          response: { usage: null },
        },
      ])('accepts responses with $name', async ({ response }) => {
        const result = await safeValidateTypes({
          value: { type, response },
          schema: openaiResponsesChunkSchema,
        });

        expect(result).toMatchObject({ success: true, value: { type } });
      });
    },
  );
});

describe('OpenAI Responses usage schemas', () => {
  const usage = {
    input_tokens: 12,
    input_tokens_details: {
      cached_tokens: 2,
      cache_write_tokens: 1,
      orchestration_input_tokens: 4,
      orchestration_input_cached_tokens: 3,
      future_input_detail: { tokens: 5 },
    },
    output_tokens: 8,
    output_tokens_details: {
      reasoning_tokens: 3,
      orchestration_output_tokens: 2,
      future_output_detail: ['preserved'],
    },
    total_tokens: 20,
    future_usage_field: { value: true },
  };

  const cases = [
    {
      name: 'normal response',
      normalResponse: true,
      value: { usage },
      getUsage: (value: unknown) => (value as { usage: unknown }).usage,
    },
    {
      name: 'completed event',
      normalResponse: false,
      value: { type: 'response.completed', response: { usage } },
      getUsage: (value: unknown) =>
        (value as { response: { usage: unknown } }).response.usage,
    },
    {
      name: 'incomplete event',
      normalResponse: false,
      value: { type: 'response.incomplete', response: { usage } },
      getUsage: (value: unknown) =>
        (value as { response: { usage: unknown } }).response.usage,
    },
    {
      name: 'failed event',
      normalResponse: false,
      value: {
        type: 'response.failed',
        sequence_number: 1,
        response: { usage },
      },
      getUsage: (value: unknown) =>
        (value as { response: { usage: unknown } }).response.usage,
    },
  ];

  function validateUsageCase({
    normalResponse,
    value,
  }: {
    normalResponse: boolean;
    value: unknown;
  }) {
    return normalResponse
      ? safeValidateTypes({
          value,
          schema: openaiResponsesResponseSchema,
        })
      : safeValidateTypes({
          value,
          schema: openaiResponsesChunkSchema,
        });
  }

  it.each(cases)('preserves complete usage for $name', async testCase => {
    const result = await validateUsageCase(testCase);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(testCase.getUsage(result.value)).toStrictEqual(usage);
    }
  });

  it.each(cases)('rejects invalid total_tokens for $name', async testCase => {
    const result = await validateUsageCase({
      normalResponse: testCase.normalResponse,
      value: {
        ...testCase.value,
        ...(testCase.value.type == null
          ? { usage: { ...usage, total_tokens: '20' } }
          : {
              response: {
                ...testCase.value.response,
                usage: { ...usage, total_tokens: '20' },
              },
            }),
      },
    });

    expect(result.success).toBe(false);
  });

  it.each([
    { name: 'input_tokens', value: { ...usage, input_tokens: '12' } },
    {
      name: 'input_tokens_details.cached_tokens',
      value: {
        ...usage,
        input_tokens_details: {
          ...usage.input_tokens_details,
          cached_tokens: '2',
        },
      },
    },
    { name: 'output_tokens', value: { ...usage, output_tokens: '8' } },
    {
      name: 'output_tokens_details.reasoning_tokens',
      value: {
        ...usage,
        output_tokens_details: {
          ...usage.output_tokens_details,
          reasoning_tokens: '3',
        },
      },
    },
  ])('rejects invalid $name values', async ({ value }) => {
    const result = await safeValidateTypes({
      value: { usage: value },
      schema: openaiResponsesResponseSchema,
    });

    expect(result.success).toBe(false);
  });

  it('accepts failed events with null usage', async () => {
    const result = await safeValidateTypes({
      value: {
        type: 'response.failed',
        sequence_number: 1,
        response: { usage: null },
      },
      schema: openaiResponsesChunkSchema,
    });

    expect(result).toMatchObject({
      success: true,
      value: {
        type: 'response.failed',
        response: { usage: null },
      },
    });
  });
});
