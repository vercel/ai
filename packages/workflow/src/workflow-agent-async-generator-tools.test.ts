import type {
  LanguageModelV4GenerateResult,
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { ToolLoopAgent, tool, type StepResult, type ToolSet } from 'ai';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import type { ModelCallStreamPart } from './model-call.js';
import {
  WorkflowAgent,
  type WorkflowAgentToolExecutionEndEvent,
} from './workflow-agent.js';

const prompt = 'What is the weather in London?';

describe('WorkflowAgent async generator tools', () => {
  it('uses the last yielded value as the tool result', async () => {
    const tools = {
      weather: tool({
        inputSchema: z.object({ city: z.string() }),
        execute: async function* () {
          yield { status: 'loading' };
          yield { temperature: 18 };
        },
      }),
    };

    const coreGenerate = await runCoreGenerate(tools);
    const coreStream = await runCoreStream(tools);
    const workflowGenerate = await runWorkflowGenerate(tools);
    const workflowStream = await runWorkflowStream(tools);

    for (const { steps } of [
      coreGenerate,
      coreStream,
      workflowGenerate,
      workflowStream,
    ]) {
      expect(steps[0]!.toolResults).toMatchObject([
        {
          type: 'tool-result',
          toolCallId: 'weather-call',
          toolName: 'weather',
        },
      ]);
      expect(steps[0]!.toolResults[0]!.output).toEqual({ temperature: 18 });
    }

    const expectedToolMessage = [
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'weather-call',
            toolName: 'weather',
            output: { type: 'json', value: { temperature: 18 } },
          },
        ],
      },
    ];
    for (const { toolPrompt } of [
      coreGenerate,
      coreStream,
      workflowGenerate,
      workflowStream,
    ]) {
      expect(toolPrompt).toEqual(expectedToolMessage);
    }
  });

  it('matches ToolLoopAgent for a generator that throws after yielding', async () => {
    const tools = {
      weather: tool({
        inputSchema: z.object({ city: z.string() }),
        execute: async function* () {
          yield { status: 'loading' };
          throw new Error('boom');
        },
      }),
    };

    const core = await runCoreGenerate(tools);
    const workflow = await runWorkflowGenerate(tools);

    expect(comparableContent(workflow.steps[0]!.content)).toEqual(
      comparableContent(core.steps[0]!.content),
    );
    expect(workflow.toolPrompt).toEqual(core.toolPrompt);
    expect(workflow.toolPrompt).toMatchObject([
      { role: 'tool', content: [{ output: { type: 'error-text' } }] },
    ]);
  });

  it('matches ToolLoopAgent in stream() for a generator that throws after yielding', async () => {
    const tools = {
      weather: tool({
        inputSchema: z.object({ city: z.string() }),
        execute: async function* () {
          yield { status: 'loading' };
          throw new Error('boom');
        },
      }),
    };

    const core = await runCoreStream(tools);
    const workflow = await runWorkflowStream(tools);

    expect(comparableContent(workflow.steps[0]!.content)).toEqual(
      comparableContent(core.steps[0]!.content),
    );
    expect(workflow.toolPrompt).toEqual(core.toolPrompt);
  });

  it('matches ToolLoopAgent for a generator that yields nothing', async () => {
    const tools = {
      weather: tool({
        inputSchema: z.object({ city: z.string() }),
        execute: async function* () {
          const values: Array<{ temperature: number }> = [];
          for (const value of values) {
            yield value;
          }
        },
      }),
    };

    const core = await runCoreGenerate(tools);
    const workflow = await runWorkflowGenerate(tools);

    expect(workflow.steps[0]!.toolResults).toEqual(core.steps[0]!.toolResults);
    expect(workflow.steps[0]!.toolResults[0]!.output).toBeUndefined();
    expect(workflow.toolPrompt).toEqual(core.toolPrompt);
  });

  it('matches ToolLoopAgent in stream() for a generator that yields nothing', async () => {
    const tools = {
      weather: tool({
        inputSchema: z.object({ city: z.string() }),
        execute: async function* () {
          const values: Array<{ temperature: number }> = [];
          for (const value of values) {
            yield value;
          }
        },
      }),
    };

    const core = await runCoreStream(tools);
    const workflow = await runWorkflowStream(tools);

    // Stream steps of ToolLoopAgent mark results with `dynamic: false`, which
    // WorkflowAgent omits, so compare the result count and output instead.
    expect(workflow.steps[0]!.toolResults).toHaveLength(1);
    expect(core.steps[0]!.toolResults).toHaveLength(1);
    expect(workflow.steps[0]!.toolResults[0]!.output).toBeUndefined();
    expect(core.steps[0]!.toolResults[0]!.output).toBeUndefined();
    expect(workflow.toolPrompt).toEqual(core.toolPrompt);
  });

  it('keeps the result of an async function tool', async () => {
    const tools = weatherTools(async () => ({ temperature: 18 }));

    const coreGenerate = await runCoreGenerate(tools);
    const workflowGenerate = await runWorkflowGenerate(tools);
    const coreStream = await runCoreStream(tools);
    const workflowStream = await runWorkflowStream(tools);

    for (const { steps } of [
      workflowGenerate,
      workflowStream,
      coreGenerate,
      coreStream,
    ]) {
      expect(steps[0]!.toolResults[0]!.output).toEqual({ temperature: 18 });
    }
    expect(workflowGenerate.toolPrompt).toEqual(coreGenerate.toolPrompt);
    expect(workflowStream.toolPrompt).toEqual(coreStream.toolPrompt);
  });

  it('keeps the result of a synchronous function tool', async () => {
    const tools = weatherTools(() => ({ temperature: 18 }));

    const coreGenerate = await runCoreGenerate(tools);
    const workflowGenerate = await runWorkflowGenerate(tools);
    const coreStream = await runCoreStream(tools);
    const workflowStream = await runWorkflowStream(tools);

    for (const { steps } of [
      workflowGenerate,
      workflowStream,
      coreGenerate,
      coreStream,
    ]) {
      expect(steps[0]!.toolResults[0]!.output).toEqual({ temperature: 18 });
    }
    expect(workflowGenerate.toolPrompt).toEqual(coreGenerate.toolPrompt);
    expect(workflowStream.toolPrompt).toEqual(coreStream.toolPrompt);
  });

  it('reports the last yielded value to onToolExecutionEnd', async () => {
    const tools = {
      weather: tool({
        inputSchema: z.object({ city: z.string() }),
        execute: async function* () {
          yield { status: 'loading' };
          yield { temperature: 18 };
        },
      }),
    };
    const endEvents: WorkflowAgentToolExecutionEndEvent[] = [];

    await new WorkflowAgent({
      model: createAgentModel(responses()),
      tools,
    }).stream({
      prompt,
      onToolExecutionEnd: event => {
        endEvents.push(event);
      },
    });

    expect(endEvents).toHaveLength(1);
    expect(endEvents[0]).toMatchObject({
      toolCall: { toolCallId: 'weather-call', toolName: 'weather' },
      success: true,
      output: { temperature: 18 },
    });
  });

  it('writes one tool result chunk with the last yielded value to the writable', async () => {
    const tools = {
      weather: tool({
        inputSchema: z.object({ city: z.string() }),
        execute: async function* () {
          yield { status: 'loading' };
          yield { temperature: 18 };
        },
      }),
    };
    const chunks: ModelCallStreamPart<ToolSet>[] = [];
    const writable = new WritableStream<ModelCallStreamPart<ToolSet>>({
      write(chunk) {
        chunks.push(chunk);
      },
    });

    await new WorkflowAgent({
      model: createAgentModel(responses()),
      tools,
    }).stream({ prompt, writable });

    const toolResultChunks = chunks.filter(
      chunk => chunk.type === 'tool-result',
    );
    expect(toolResultChunks).toHaveLength(1);
    expect(toolResultChunks[0]).toMatchObject({
      toolCallId: 'weather-call',
      toolName: 'weather',
      input: { city: 'London' },
      output: { temperature: 18 },
    });
  });
});

function weatherTools(
  execute: () => { temperature: number } | Promise<{ temperature: number }>,
) {
  return {
    weather: tool({
      inputSchema: z.object({ city: z.string() }),
      execute,
    }),
  };
}

async function runCoreGenerate(tools: ToolSet) {
  const model = createAgentModel(responses());
  const { steps } = await new ToolLoopAgent({ model, tools }).generate({
    prompt,
  });
  return { steps, toolPrompt: toolMessages(model.doGenerateCalls[1]!.prompt) };
}

async function runCoreStream(tools: ToolSet) {
  const model = createAgentModel(responses());
  const result = await new ToolLoopAgent({ model, tools }).stream({ prompt });
  await result.consumeStream();
  return {
    steps: await result.steps,
    toolPrompt: toolMessages(model.doStreamCalls[1]!.prompt),
  };
}

async function runWorkflowGenerate(tools: ToolSet) {
  const model = createAgentModel(responses());
  const { steps } = await new WorkflowAgent({ model, tools }).generate({
    prompt,
  });
  return { steps, toolPrompt: toolMessages(model.doGenerateCalls[1]!.prompt) };
}

async function runWorkflowStream(tools: ToolSet) {
  const model = createAgentModel(responses());
  const { steps } = await new WorkflowAgent({ model, tools }).stream({
    prompt,
  });
  return { steps, toolPrompt: toolMessages(model.doStreamCalls[1]!.prompt) };
}

function toolMessages(prompt: LanguageModelV4Prompt) {
  return prompt.filter(message => message.role === 'tool');
}

/**
 * Steps keep a thrown tool error as the error value in `ToolLoopAgent` and as
 * error message text in `WorkflowAgent`, so compare the message text instead of
 * the error object.
 */
function comparableContent(content: StepResult<ToolSet>['content']) {
  return content.map(part =>
    part.type === 'tool-error'
      ? {
          type: part.type,
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: part.input,
          error: String(part.error),
        }
      : part,
  );
}

function responses() {
  return [toolResponse(), textResponse('It is 18°C.')];
}

/**
 * The same scripted responses for core and WorkflowAgent tests.
 * Deliberately supports only the content used by these fixtures, so adding a
 * new content kind requires defining its equivalent streaming representation.
 */
function createAgentModel(responses: LanguageModelV4GenerateResult[]) {
  return new MockLanguageModelV4({
    doGenerate: responses,
    doStream: responses.map(response => {
      const parts: LanguageModelV4StreamPart[] = [
        { type: 'stream-start', warnings: response.warnings },
        { type: 'response-metadata', ...response.response },
      ];

      for (const [index, part] of response.content.entries()) {
        switch (part.type) {
          case 'text': {
            const id = `text-${index}`;
            parts.push(
              { type: 'text-start', id },
              { type: 'text-delta', id, delta: part.text },
              { type: 'text-end', id },
            );
            break;
          }
          case 'tool-call':
            parts.push(part);
            break;
          default:
            throw new Error(`Unsupported fixture content: ${part.type}`);
        }
      }

      parts.push({
        type: 'finish',
        finishReason: response.finishReason,
        usage: response.usage,
        providerMetadata: response.providerMetadata,
      });

      return { stream: convertArrayToReadableStream(parts) };
    }),
  });
}

function textResponse(text: string): LanguageModelV4GenerateResult {
  return {
    content: [{ type: 'text', text }],
    finishReason: { unified: 'stop', raw: 'stop' },
    usage: {
      inputTokens: {
        total: 3,
        noCache: 2,
        cacheRead: 1,
        cacheWrite: undefined,
      },
      outputTokens: { total: 2, text: 2, reasoning: undefined },
    },
    warnings: [],
    response: {
      id: 'response-fixture',
      timestamp: new Date(0),
      modelId: 'mock-model-id',
    },
  };
}

function toolResponse(): LanguageModelV4GenerateResult {
  return {
    ...textResponse('Checking the weather.'),
    content: [
      { type: 'text', text: 'Checking the weather.' },
      {
        type: 'tool-call',
        toolCallId: 'weather-call',
        toolName: 'weather',
        input: '{"city":"London"}',
      },
    ],
    finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
  };
}
