import { safeValidateTypes, type InferSchema } from '@ai-sdk/provider-utils';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  openaiResponsesChunkSchema,
  type openaiResponsesResponseSchema,
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
});
