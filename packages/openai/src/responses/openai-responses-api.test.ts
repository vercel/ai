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
      Extract<
        NonNullable<Response['output']>[number],
        { type: 'message' }
      >['content'][number],
      { type: 'output_text' }
    >['annotations'][number];

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

  it('aligns async mode between function call schemas', () => {
    type AddedAsync = Extract<
      Extract<Chunk, { type: 'response.output_item.added' }>['item'],
      { type: 'function_call' }
    >['async'];

    type DoneAsync = Extract<
      Extract<Chunk, { type: 'response.output_item.done' }>['item'],
      { type: 'function_call' }
    >['async'];

    type ResponseAsync = Extract<
      NonNullable<Response['output']>[number],
      { type: 'function_call' }
    >['async'];

    expectTypeOf<AddedAsync>().toEqualTypeOf<DoneAsync>();
    expectTypeOf<DoneAsync>().toEqualTypeOf<ResponseAsync>();
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

describe('openaiResponsesChunkSchema refusal events', () => {
  it.each([
    {
      type: 'response.refusal.delta',
      content_index: 0,
      delta: "I'm sorry",
      item_id: 'msg_1',
      output_index: 0,
      sequence_number: 4,
    },
    {
      type: 'response.refusal.done',
      content_index: 0,
      item_id: 'msg_1',
      output_index: 0,
      refusal: "I'm sorry, I can't assist with that.",
      sequence_number: 5,
    },
  ])('accepts $type events', async event => {
    const result = await safeValidateTypes({
      value: event,
      schema: openaiResponsesChunkSchema,
    });

    expect(result).toMatchObject({
      success: true,
      value: { type: event.type },
    });
  });
});

describe('openaiResponsesResponseSchema refusal content parts', () => {
  it('accepts refusal content parts in message output items', async () => {
    const result = await safeValidateTypes({
      value: {
        id: 'resp_1',
        output: [
          {
            type: 'message',
            id: 'msg_1',
            role: 'assistant',
            content: [
              {
                type: 'refusal',
                refusal: "I'm sorry, I can't assist with that.",
              },
            ],
          },
        ],
      },
      schema: openaiResponsesResponseSchema,
    });

    expect(result).toMatchObject({
      success: true,
      value: {
        output: [
          {
            type: 'message',
            content: [{ type: 'refusal' }],
          },
        ],
      },
    });
  });

  it('accepts text and refusal content parts in the same message', async () => {
    const result = await safeValidateTypes({
      value: {
        id: 'resp_1',
        output: [
          {
            type: 'message',
            id: 'msg_1',
            role: 'assistant',
            content: [
              { type: 'output_text', text: 'partial', annotations: [] },
              { type: 'refusal', refusal: "I can't assist with that." },
            ],
          },
        ],
      },
      schema: openaiResponsesResponseSchema,
    });

    expect(result).toMatchObject({
      success: true,
      value: {
        output: [
          {
            type: 'message',
            content: [
              { type: 'output_text', text: 'partial' },
              { type: 'refusal' },
            ],
          },
        ],
      },
    });
  });
});
