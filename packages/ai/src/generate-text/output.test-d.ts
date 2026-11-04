import {
  jsonSchema,
  lazySchema,
  zodSchema,
  type FlexibleSchema,
} from '@ai-sdk/provider-utils';
import { describe, expectTypeOf, it } from 'vitest';
import * as z3 from 'zod/v3';
import { z } from 'zod/v4';
import type { AsyncIterableStream } from '../util';
import type { DeepPartial } from '../util/deep-partial';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { generateText } from './generate-text';
import * as Output from './output';
import type {
  InferCompleteOutput,
  InferElementOutput,
  InferPartialOutput,
} from './output-utils';
import { streamText } from './stream-text';

type A = { type: 'a'; a: string };
type B = { type: 'b'; b: number };

const schemaA = z.object({ type: z.literal('a'), a: z.string() });
const schemaB = z.object({ type: z.literal('b'), b: z.number() });
const schemas = { a: schemaA, b: schemaB };

declare const key: keyof typeof schemas;

describe('Output.object', () => {
  it('should infer the output type from a single schema', () => {
    const output = Output.object({ schema: schemaA });

    expectTypeOf<InferCompleteOutput<typeof output>>().toEqualTypeOf<A>();
    expectTypeOf<InferPartialOutput<typeof output>>().toEqualTypeOf<
      DeepPartial<A>
    >();
  });

  it('should infer a union output type from a union of zod v4 schemas', () => {
    const output = Output.object({ schema: schemas[key] });

    expectTypeOf<InferCompleteOutput<typeof output>>().toEqualTypeOf<A | B>();
    expectTypeOf<InferPartialOutput<typeof output>>().toEqualTypeOf<
      DeepPartial<A | B>
    >();
  });

  it('should infer a union output type from a union of zod v3 schemas', () => {
    const schemasV3 = {
      a: z3.object({ type: z3.literal('a'), a: z3.string() }),
      b: z3.object({ type: z3.literal('b'), b: z3.number() }),
    };

    const output = Output.object({ schema: schemasV3[key] });

    expectTypeOf<InferCompleteOutput<typeof output>>().toEqualTypeOf<A | B>();
  });

  it('should infer a union output type from a union of json schemas', () => {
    const schema =
      key === 'a' ? jsonSchema<A>({ type: 'object' }) : jsonSchema<B>({});

    const output = Output.object({ schema });

    expectTypeOf<InferCompleteOutput<typeof output>>().toEqualTypeOf<A | B>();
  });

  it('should infer the output type from a schema typed as FlexibleSchema', () => {
    const schema: FlexibleSchema<A> = schemaA;

    const output = Output.object({ schema });

    expectTypeOf<InferCompleteOutput<typeof output>>().toEqualTypeOf<A>();
  });

  it('should infer the output type from zodSchema and lazySchema', () => {
    const fromZodSchema = Output.object({ schema: zodSchema(schemaA) });
    expectTypeOf<
      InferCompleteOutput<typeof fromZodSchema>
    >().toEqualTypeOf<A>();

    const fromLazySchema = Output.object({
      schema: lazySchema(() => zodSchema(schemaA)),
    });
    expectTypeOf<
      InferCompleteOutput<typeof fromLazySchema>
    >().toEqualTypeOf<A>();
  });

  it('should infer the transformed output type of a schema', () => {
    const output = Output.object({
      schema: z.object({ a: z.string().transform(value => value.length) }),
    });

    expectTypeOf<InferCompleteOutput<typeof output>>().toEqualTypeOf<{
      a: number;
    }>();
  });

  it('should support an explicit output type argument', () => {
    const output = Output.object<A | B>({ schema: schemas[key] });

    expectTypeOf<InferCompleteOutput<typeof output>>().toEqualTypeOf<A | B>();
    expectTypeOf<
      InferCompleteOutput<ReturnType<typeof Output.object<A>>>
    >().toEqualTypeOf<A>();
  });

  it('should reject values that are not schemas', () => {
    // @ts-expect-error - not a schema
    Output.object({ schema: 'not a schema' });
  });

  it('should infer a union output type in generateText', async () => {
    const result = await generateText({
      model: new MockLanguageModelV4(),
      prompt: 'Hello, world!',
      output: Output.object({ schema: schemas[key] }),
    });

    expectTypeOf<typeof result.output>().toEqualTypeOf<A | B>();
  });

  it('should infer a union partial output type in streamText', () => {
    const result = streamText({
      model: new MockLanguageModelV4(),
      prompt: 'Hello, world!',
      output: Output.object({ schema: schemas[key] }),
    });

    expectTypeOf<typeof result.partialOutputStream>().toEqualTypeOf<
      AsyncIterableStream<DeepPartial<A | B>>
    >();
  });
});

describe('Output.array', () => {
  it('should infer the element type from a single schema', () => {
    const output = Output.array({ element: schemaA });

    expectTypeOf<InferCompleteOutput<typeof output>>().toEqualTypeOf<A[]>();
    expectTypeOf<InferPartialOutput<typeof output>>().toEqualTypeOf<A[]>();
    expectTypeOf<InferElementOutput<typeof output>>().toEqualTypeOf<A>();
  });

  it('should infer a union element type from a union of zod v4 schemas', () => {
    const output = Output.array({ element: schemas[key] });

    expectTypeOf<InferCompleteOutput<typeof output>>().toEqualTypeOf<
      Array<A | B>
    >();
    expectTypeOf<InferPartialOutput<typeof output>>().toEqualTypeOf<
      Array<A | B>
    >();
    expectTypeOf<InferElementOutput<typeof output>>().toEqualTypeOf<A | B>();
  });

  it('should infer a union element type from a union of zod v3 schemas', () => {
    const schemasV3 = {
      a: z3.object({ type: z3.literal('a'), a: z3.string() }),
      b: z3.object({ type: z3.literal('b'), b: z3.number() }),
    };

    const output = Output.array({ element: schemasV3[key] });

    expectTypeOf<InferElementOutput<typeof output>>().toEqualTypeOf<A | B>();
  });

  it('should support an explicit element type argument', () => {
    const output = Output.array<A | B>({ element: schemas[key] });

    expectTypeOf<InferElementOutput<typeof output>>().toEqualTypeOf<A | B>();
    expectTypeOf<
      InferElementOutput<ReturnType<typeof Output.array<A>>>
    >().toEqualTypeOf<A>();
  });

  it('should reject values that are not schemas', () => {
    // @ts-expect-error - not a schema
    Output.array({ element: 'not a schema' });
  });

  it('should infer a union element type in streamText', () => {
    const result = streamText({
      model: new MockLanguageModelV4(),
      prompt: 'Hello, world!',
      output: Output.array({ element: schemas[key] }),
    });

    expectTypeOf<typeof result.elementStream>().toEqualTypeOf<
      AsyncIterableStream<A | B>
    >();
  });
});
