import { Output, tool } from 'ai';
import { expectTypeOf, it } from 'vitest';
import { z } from 'zod/v4';
import { WorkflowAgent } from './index.js';

it('infers text, structured outputs, per-call overrides, tools and runtime context', async () => {
  const agent = new WorkflowAgent({
    model: 'mock/model',
    runtimeContext: { userId: 'user' },
    tools: {
      lookup: tool({
        inputSchema: z.object({ query: z.string() }),
        execute: async () => 42,
      }),
    },
  });
  const result = await agent.generate({
    prompt: 'test',
    onStepEnd: step => {
      expectTypeOf(step.runtimeContext.userId).toEqualTypeOf<string>();
    },
  });
  expectTypeOf(result.output).toEqualTypeOf<string>();
  expectTypeOf(result.staticToolCalls[0].input).toEqualTypeOf<{
    query: string;
  }>();
  expectTypeOf(result.staticToolResults[0].output).toEqualTypeOf<number>();
  expectTypeOf(result.finalStep.runtimeContext.userId).toEqualTypeOf<string>();
  const structured = new WorkflowAgent({
    model: 'mock/model',
    output: Output.object({ schema: z.object({ answer: z.number() }) }),
  });
  expectTypeOf(
    (await structured.generate({ prompt: 'test' })).output,
  ).toEqualTypeOf<{ answer: number }>();
  expectTypeOf(
    (await structured.generate({ prompt: 'test', output: Output.text() }))
      .output,
  ).toEqualTypeOf<string>();
  // @ts-expect-error generate does not take a writable
  agent.generate({ prompt: 'test', writable: new WritableStream() });
  // @ts-expect-error generate does not expose raw chunks
  agent.generate({ prompt: 'test', includeRawChunks: true });
  agent.generate({
    prompt: 'test',
    // @ts-expect-error generate does not transform streams
    experimental_transform: () => new TransformStream(),
  });
  // @ts-expect-error generate does not close streams
  agent.generate({ prompt: 'test', preventClose: true });
  // @ts-expect-error generate does not send stream finish chunks
  agent.generate({ prompt: 'test', sendFinish: false });
  // @ts-expect-error prompt and messages are mutually exclusive
  agent.generate({ prompt: 'test', messages: [] });
});

it('validates generate tools context and per-call overrides', async () => {
  const agent = new WorkflowAgent({
    model: 'mock/model',
    tools: {
      lookup: tool({
        inputSchema: z.object({ query: z.string() }),
        contextSchema: z.object({ apiKey: z.string() }),
        execute: async (_input, { context }) => {
          expectTypeOf(context.apiKey).toEqualTypeOf<string>();
          return 42;
        },
      }),
    },
    toolsContext: { lookup: { apiKey: 'initial' } },
  });
  await agent.generate({
    prompt: 'test',
    toolsContext: { lookup: { apiKey: 'override' } },
  });
  // @ts-expect-error tool context values must match their schema
  agent.generate({ prompt: 'test', toolsContext: { lookup: { apiKey: 123 } } });
});
