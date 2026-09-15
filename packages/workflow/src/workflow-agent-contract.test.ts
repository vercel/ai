import { ToolLoopAgent, tool } from 'ai';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import {
  createAgentModel,
  textResponse,
  toolResponse,
} from './__fixtures__/agent-model.js';
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
