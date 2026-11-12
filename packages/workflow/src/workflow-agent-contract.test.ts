import type {
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { ToolLoopAgent, tool } from 'ai';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import type { ModelCallStreamPart } from './do-stream-step.js';
import { WorkflowAgent } from './workflow-agent.js';

const prompt = 'What is the weather in London?';

function weatherTools() {
  return {
    weather: tool({
      inputSchema: z.object({ city: z.string() }),
      execute: async () => ({ temperature: 18 }),
    }),
  };
}

// These are passing current-behavior tests, not calls to the unimplemented
// WorkflowAgent.generate(). Reuse the fixtures for generate parity in Phase 3.
describe('WorkflowAgent stream and core generate contracts', () => {
  it('uses equivalent model responses while distinguishing final-step and all-step tools', async () => {
    const responses = [toolResponse(), textResponse('It is 18°C.')];
    const generateModel = createAgentModel(responses);
    const streamModel = createAgentModel(responses);
    const generated = await new ToolLoopAgent({
      model: generateModel,
      tools: weatherTools(),
    }).generate({ prompt });
    const streamed = await new WorkflowAgent({
      model: streamModel,
      tools: weatherTools(),
    }).stream({ prompt });

    expect(generateModel.doGenerateCalls).toHaveLength(2);
    expect(generateModel.doStreamCalls).toHaveLength(0);
    expect(streamModel.doStreamCalls).toHaveLength(2);
    expect(streamModel.doGenerateCalls).toHaveLength(0);
    expect(streamed.steps.map(step => step.text)).toEqual([
      'Checking the weather.',
      'It is 18°C.',
    ]);
    expect(streamed.steps.map(step => step.text)).toEqual(
      generated.steps.map(step => step.text),
    );
    expect(streamed.steps.at(-1)?.text).toBe(generated.text);
    expect(streamed.finishReason).toBe(generated.finishReason);
    expect(streamed.steps[0].toolCalls).toEqual(generated.toolCalls);
    for (const results of [
      streamed.steps[0].toolResults,
      generated.toolResults,
    ]) {
      expect(results).toMatchObject([
        {
          type: 'tool-result',
          toolCallId: 'weather-call',
          toolName: 'weather',
          input: { city: 'London' },
          output: { temperature: 18 },
        },
      ]);
    }
    expect(generated.toolCalls).toHaveLength(1);
    expect(generated.toolResults).toHaveLength(1);
    expect(streamed.toolCalls).toEqual([]);
    expect(streamed.toolResults).toEqual([]);
    expect(streamed.totalUsage).toMatchObject({
      inputTokens: generated.usage.inputTokens,
      outputTokens: generated.usage.outputTokens,
      totalTokens: generated.usage.totalTokens,
    });

    // Workflow messages include the input conversation; core responseMessages
    // contain only generated messages. Preparation can replace history, so
    // this simple example does not prescribe slicing as an implementation.
    expect(streamed.messages[0]).toMatchObject({ role: 'user' });
    expect(generated.responseMessages.map(message => message.role)).toEqual([
      'assistant',
      'tool',
      'assistant',
    ]);
    expect(streamed.messages.slice(1)).toEqual(generated.responseMessages);
  });

  it('returns unresolved client tool calls in both contracts', async () => {
    const tools = {
      weather: tool({ inputSchema: z.object({ city: z.string() }) }),
    };
    const generated = await new ToolLoopAgent({
      model: createAgentModel([toolResponse()]),
      tools,
    }).generate({ prompt });
    const streamed = await new WorkflowAgent({
      model: createAgentModel([toolResponse()]),
      tools,
    }).stream({ prompt });

    expect(streamed.steps).toHaveLength(1);
    expect(generated.steps).toHaveLength(1);
    expect(streamed.toolCalls).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'weather-call',
        toolName: 'weather',
        input: { city: 'London' },
      },
    ]);
    expect(generated.toolCalls).toMatchObject(streamed.toolCalls);
    expect(streamed.toolResults).toEqual([]);
    expect(generated.toolResults).toEqual([]);
  });

  it('distinguishes the core 20-step default from the unbounded Workflow stream default', async () => {
    const responses = [
      ...Array.from({ length: 21 }, (_, index) => {
        const response = toolResponse();
        return {
          ...response,
          content: response.content.map(part =>
            part.type === 'tool-call'
              ? { ...part, toolCallId: `weather-${index}` }
              : part,
          ),
        };
      }),
      textResponse('Done.'),
    ];
    const generated = await new ToolLoopAgent({
      model: createAgentModel(responses),
      tools: weatherTools(),
    }).generate({ prompt });
    const streamed = await new WorkflowAgent({
      model: createAgentModel(responses),
      tools: weatherTools(),
    }).stream({ prompt });

    expect(generated.steps).toHaveLength(20);
    expect(generated.finishReason).toBe('tool-calls');
    expect(streamed.steps).toHaveLength(22);
    expect(streamed.steps.at(-1)?.text).toBe('Done.');
    // This comparison runs 42 model steps under the full monorepo CI load.
  }, 30_000);

  it('applies prepareStep setting overrides to one step only, like core', async () => {
    const responses = () => [toolResponse(), textResponse('It is 18°C.')];
    const tools = () => ({
      ...weatherTools(),
      other: tool({
        inputSchema: z.object({}),
        execute: async () => 'unused',
      }),
    });
    const firstStepOverrides = {
      temperature: 0.9,
      toolChoice: 'required' as const,
      activeTools: ['weather' as const],
      providerOptions: { mock: { firstStep: true } },
    };
    const summarize = (call: {
      temperature?: number;
      toolChoice?: unknown;
      tools?: Array<{ name: string }>;
      providerOptions?: unknown;
    }) => ({
      temperature: call.temperature,
      toolChoice: call.toolChoice,
      tools: call.tools?.map(modelTool => modelTool.name),
      providerOptions: call.providerOptions,
    });

    const coreModel = createAgentModel(responses());
    await new ToolLoopAgent({
      model: coreModel,
      tools: tools(),
      temperature: 0.1,
      prepareStep: ({ stepNumber }) =>
        stepNumber === 0 ? firstStepOverrides : undefined,
    }).generate({ prompt });

    const generateModel = createAgentModel(responses());
    await new WorkflowAgent({
      model: generateModel,
      tools: tools(),
      temperature: 0.1,
      prepareStep: ({ stepNumber }) =>
        stepNumber === 0 ? firstStepOverrides : undefined,
    }).generate({ prompt });

    const streamModel = createAgentModel(responses());
    await new WorkflowAgent({
      model: streamModel,
      tools: tools(),
      temperature: 0.1,
      prepareStep: ({ stepNumber }) =>
        stepNumber === 0 ? firstStepOverrides : undefined,
    }).stream({ prompt });

    const expected = [
      {
        temperature: 0.9,
        toolChoice: { type: 'required' },
        tools: ['weather'],
        providerOptions: { mock: { firstStep: true } },
      },
      {
        temperature: 0.1,
        toolChoice: { type: 'auto' },
        tools: ['weather', 'other'],
        providerOptions: undefined,
      },
    ];
    expect(coreModel.doGenerateCalls.map(summarize)).toEqual(expected);
    expect(generateModel.doGenerateCalls.map(summarize)).toEqual(expected);
    expect(streamModel.doStreamCalls.map(summarize)).toEqual(expected);
  });

  it('uses a prepareStep model override for one step only, like core', async () => {
    for (const run of [
      (model: MockLanguageModelV4, firstStepModel: MockLanguageModelV4) =>
        new ToolLoopAgent({
          model,
          tools: weatherTools(),
          prepareStep: ({ stepNumber }) =>
            stepNumber === 0 ? { model: firstStepModel } : undefined,
        }).generate({ prompt }),
      (model: MockLanguageModelV4, firstStepModel: MockLanguageModelV4) =>
        new WorkflowAgent({
          model,
          tools: weatherTools(),
          prepareStep: ({ stepNumber }) =>
            stepNumber === 0 ? { model: firstStepModel } : undefined,
        }).generate({ prompt }),
      (model: MockLanguageModelV4, firstStepModel: MockLanguageModelV4) =>
        new WorkflowAgent({
          model,
          tools: weatherTools(),
          prepareStep: ({ stepNumber }) =>
            stepNumber === 0 ? { model: firstStepModel } : undefined,
        }).stream({ prompt }),
    ]) {
      const model = createAgentModel([textResponse('It is 18°C.')]);
      const firstStepModel = createAgentModel([toolResponse()]);

      await run(model, firstStepModel);

      expect(
        firstStepModel.doGenerateCalls.length +
          firstStepModel.doStreamCalls.length,
      ).toBe(1);
      expect(model.doGenerateCalls.length + model.doStreamCalls.length).toBe(1);
    }
  });

  it('applies stream settings after prepareCall and constructor defaults', async () => {
    const model = createAgentModel([textResponse('Done.')]);
    const preparedTemperatures: Array<number | undefined> = [];
    await new WorkflowAgent({
      model,
      temperature: 0.1,
      maxOutputTokens: 10,
      topP: 0.9,
      prepareCall: options => {
        preparedTemperatures.push(options.temperature);
        return { ...options, temperature: 0.2, maxOutputTokens: 20 };
      },
    }).stream({ prompt, temperature: 0.3 });

    expect(preparedTemperatures).toEqual([0.1]);
    expect(model.doStreamCalls[0]).toMatchObject({
      temperature: 0.3,
      maxOutputTokens: 20,
      topP: 0.9,
    });
  });

  it('composes constructor and call callbacks around model and tool execution', async () => {
    const events: string[] = [];
    const callbacks = (scope: string) => ({
      onStart: () => {
        events.push(`${scope}:start`);
      },
      onStepStart: () => {
        events.push(`${scope}:step-start`);
      },
      onToolExecutionStart: () => {
        events.push(`${scope}:tool-start`);
      },
      onToolExecutionEnd: () => {
        events.push(`${scope}:tool-end`);
      },
      onStepEnd: () => {
        events.push(`${scope}:step-end`);
      },
      onEnd: () => {
        events.push(`${scope}:end`);
      },
    });
    await new WorkflowAgent({
      model: createAgentModel([toolResponse(), textResponse('Done.')]),
      tools: {
        weather: tool({
          inputSchema: z.object({ city: z.string() }),
          execute: async () => {
            events.push('execute');
            return { temperature: 18 };
          },
        }),
      },
      ...callbacks('constructor'),
    }).stream({ prompt, ...callbacks('call') });

    expect(events).toEqual([
      'constructor:start',
      'call:start',
      'constructor:step-start',
      'call:step-start',
      'constructor:tool-start',
      'call:tool-start',
      'execute',
      'constructor:tool-end',
      'call:tool-end',
      'constructor:step-end',
      'call:step-end',
      'constructor:step-start',
      'call:step-start',
      'constructor:step-end',
      'call:step-end',
      'constructor:end',
      'call:end',
    ]);
  });
});

describe('WorkflowAgent stream completion contract', () => {
  it.each([false, true])(
    'forwards raw chunks when requested: %s',
    async includeRawChunks => {
      const rawValue = { provider: 'fixture', delta: 'Done.' };
      const response = textResponse('Done.');
      const parts: ModelCallStreamPart[] = [];
      const model = new MockLanguageModelV4({
        doStream: async options => ({
          stream: convertArrayToReadableStream([
            { type: 'stream-start' as const, warnings: [] },
            ...(options.includeRawChunks
              ? [{ type: 'raw' as const, rawValue }]
              : []),
            { type: 'text-start' as const, id: 'text' },
            { type: 'text-delta' as const, id: 'text', delta: 'Done.' },
            { type: 'text-end' as const, id: 'text' },
            {
              type: 'finish' as const,
              finishReason: response.finishReason,
              usage: response.usage,
            },
          ]),
        }),
      });

      await new WorkflowAgent({ model }).stream({
        prompt,
        includeRawChunks,
        writable: new WritableStream({
          write(part) {
            parts.push(part);
          },
        }),
      });

      expect(model.doStreamCalls[0].includeRawChunks).toBe(includeRawChunks);
      expect(parts.filter(part => part.type === 'raw')).toEqual(
        includeRawChunks ? [{ type: 'raw', rawValue }] : [],
      );
      expect(
        parts
          .filter(part =>
            ['text-start', 'text-delta', 'text-end', 'finish'].includes(
              part.type,
            ),
          )
          .map(part => part.type),
      ).toEqual(['text-start', 'text-delta', 'text-end', 'finish']);
    },
  );

  for (const paused of [false, true]) {
    for (const sendFinish of [false, true]) {
      for (const preventClose of [false, true]) {
        it(`paused=${paused}, sendFinish=${sendFinish}, preventClose=${preventClose}`, async () => {
          // WorkflowAgent also writes its own completion marker, beyond the
          // model-call parts accepted by the public writable option.
          const parts: Array<ModelCallStreamPart | { type: 'finish' }> = [];
          let closed = false;
          const writable = new WritableStream<ModelCallStreamPart>({
            write(part) {
              parts.push(part);
            },
            close() {
              closed = true;
            },
          });
          const model = createAgentModel([
            paused ? toolResponse() : textResponse('Done.'),
          ]);
          await new WorkflowAgent({
            model,
            tools: {
              weather: tool({
                inputSchema: z.object({ city: z.string() }),
              }),
            },
          }).stream({ prompt, writable, sendFinish, preventClose });

          expect(parts.filter(part => part.type === 'finish')).toHaveLength(
            sendFinish ? 1 : 0,
          );
          if (sendFinish) expect(parts.at(-1)).toEqual({ type: 'finish' });
          expect(closed).toBe(!preventClose);
          expect(writable.locked).toBe(false);
          if (preventClose) await writable.close();
        });
      }
    }
  }
});

/**
 * The same scripted responses for core generate and Workflow stream tests.
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
