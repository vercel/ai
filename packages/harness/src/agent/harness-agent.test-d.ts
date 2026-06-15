import { Output } from 'ai';
import { z } from 'zod';
import { describe, expectTypeOf, test } from 'vitest';
import type { HarnessAgent } from './harness-agent';
import type { HarnessAgentSession } from './harness-agent-session';

declare const agent: HarnessAgent;
declare const session: HarnessAgentSession;

const objectSchema = z.object({ sentiment: z.string(), score: z.number() });
type ObjectOutput = { sentiment: string; score: number };

describe('HarnessAgent output typing', () => {
  test('generate(): output flows the inferred schema type to result.output', async () => {
    const result = await agent.generate({
      session,
      prompt: 'x',
      output: Output.object({ schema: objectSchema }),
    });
    expectTypeOf(result.output).toEqualTypeOf<ObjectOutput>();
  });

  test('generate(): omitting output preserves the text-only (never) typing', async () => {
    const result = await agent.generate({ session, prompt: 'x' });
    expectTypeOf(result.output).toEqualTypeOf<never>();
  });

  test('stream(): output flows the inferred schema type to result.output', async () => {
    const result = await agent.stream({
      session,
      prompt: 'x',
      output: Output.object({ schema: objectSchema }),
    });
    expectTypeOf<Awaited<typeof result.output>>().toEqualTypeOf<ObjectOutput>();
  });

  test('stream(): elementStream is typed per element for Output.array', async () => {
    const result = await agent.stream({
      session,
      prompt: 'x',
      output: Output.array({ element: z.object({ id: z.number() }) }),
    });
    expectTypeOf<Awaited<typeof result.output>>().toEqualTypeOf<
      Array<{ id: number }>
    >();
    expectTypeOf(result.elementStream).toEqualTypeOf<
      AsyncIterableStream<{ id: number }>
    >();
  });

  test('continueGenerate(): output flows the inferred schema type to result.output', async () => {
    const result = await agent.continueGenerate({
      session,
      output: Output.object({ schema: objectSchema }),
    });
    expectTypeOf(result.output).toEqualTypeOf<ObjectOutput>();
  });
});

// Local mirror of AI SDK's `AsyncIterableStream` nominal shape.
type AsyncIterableStream<T> = ReadableStream<T> & AsyncIterable<T>;
