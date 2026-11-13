import type {
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { ToolLoopAgent, tool } from 'ai';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { WorkflowAgent } from './workflow-agent.js';

const prompt = 'What is the weather in London?';

// The tool names differ from their alphabetical order, so a missing or partial
// toolOrder is visible in the tool definitions that the model receives.
function orderedTools() {
  return {
    zeta: tool({
      inputSchema: z.object({}),
      execute: async () => 'zeta result',
    }),
    alpha: tool({
      inputSchema: z.object({}),
      execute: async () => 'alpha result',
    }),
    weather: tool({
      inputSchema: z.object({ city: z.string() }),
      execute: async () => ({ temperature: 18 }),
    }),
    beta: tool({
      inputSchema: z.object({}),
      execute: async () => 'beta result',
    }),
  };
}

function responses() {
  return [toolResponse(), textResponse('It is 18°C.')];
}

function callToolNames(calls: Array<{ tools?: Array<{ name: string }> }>) {
  return calls.map(call => call.tools?.map(modelTool => modelTool.name));
}

describe('WorkflowAgent toolOrder', () => {
  it('sends tools in the constructor toolOrder like ToolLoopAgent', async () => {
    const expected = ['weather', 'beta', 'alpha', 'zeta'];

    const coreGenerateModel = createAgentModel(responses());
    await new ToolLoopAgent({
      model: coreGenerateModel,
      tools: orderedTools(),
      toolOrder: ['weather', 'beta'],
    }).generate({ prompt });

    const generateModel = createAgentModel(responses());
    await new WorkflowAgent({
      model: generateModel,
      tools: orderedTools(),
      toolOrder: ['weather', 'beta'],
    }).generate({ prompt });

    expect(callToolNames(coreGenerateModel.doGenerateCalls)).toEqual([
      expected,
      expected,
    ]);
    expect(callToolNames(generateModel.doGenerateCalls)).toEqual([
      expected,
      expected,
    ]);

    const coreStreamModel = createAgentModel(responses());
    const coreStreamed = await new ToolLoopAgent({
      model: coreStreamModel,
      tools: orderedTools(),
      toolOrder: ['weather', 'beta'],
    }).stream({ prompt });
    await coreStreamed.consumeStream();

    const streamModel = createAgentModel(responses());
    await new WorkflowAgent({
      model: streamModel,
      tools: orderedTools(),
      toolOrder: ['weather', 'beta'],
    }).stream({ prompt });

    expect(callToolNames(coreStreamModel.doStreamCalls)).toEqual([
      expected,
      expected,
    ]);
    expect(callToolNames(streamModel.doStreamCalls)).toEqual([
      expected,
      expected,
    ]);
  });

  it('keeps the order of the tools object when no toolOrder is set', async () => {
    const expected = ['zeta', 'alpha', 'weather', 'beta'];

    const generateModel = createAgentModel(responses());
    await new WorkflowAgent({
      model: generateModel,
      tools: orderedTools(),
    }).generate({ prompt });

    const streamModel = createAgentModel(responses());
    await new WorkflowAgent({
      model: streamModel,
      tools: orderedTools(),
    }).stream({ prompt });

    expect(callToolNames(generateModel.doGenerateCalls)).toEqual([
      expected,
      expected,
    ]);
    expect(callToolNames(streamModel.doStreamCalls)).toEqual([
      expected,
      expected,
    ]);
  });

  it('lets the toolOrder of a call override the constructor value', async () => {
    const expected = ['beta', 'alpha', 'weather', 'zeta'];

    const generateModel = createAgentModel(responses());
    await new WorkflowAgent({
      model: generateModel,
      tools: orderedTools(),
      toolOrder: ['zeta', 'alpha'],
    }).generate({ prompt, toolOrder: ['beta'] });

    const streamModel = createAgentModel(responses());
    await new WorkflowAgent({
      model: streamModel,
      tools: orderedTools(),
      toolOrder: ['zeta', 'alpha'],
    }).stream({ prompt, toolOrder: ['beta'] });

    expect(callToolNames(generateModel.doGenerateCalls)).toEqual([
      expected,
      expected,
    ]);
    expect(callToolNames(streamModel.doStreamCalls)).toEqual([
      expected,
      expected,
    ]);
  });

  it('applies a toolOrder returned from prepareCall', async () => {
    const expected = ['alpha', 'beta', 'weather', 'zeta'];

    const generateModel = createAgentModel(responses());
    await new WorkflowAgent({
      model: generateModel,
      tools: orderedTools(),
      prepareCall: ({ toolOrder }) => ({
        toolOrder: toolOrder == null ? ['alpha'] : undefined,
      }),
    }).generate({ prompt });

    const streamModel = createAgentModel(responses());
    await new WorkflowAgent({
      model: streamModel,
      tools: orderedTools(),
      prepareCall: ({ toolOrder }) => ({
        toolOrder: toolOrder == null ? ['alpha'] : undefined,
      }),
    }).stream({ prompt });

    expect(callToolNames(generateModel.doGenerateCalls)).toEqual([
      expected,
      expected,
    ]);
    expect(callToolNames(streamModel.doStreamCalls)).toEqual([
      expected,
      expected,
    ]);
  });

  it('applies a toolOrder returned from prepareStep to that step only', async () => {
    const firstStepOrder = { toolOrder: ['weather', 'beta'] as const };
    const prepareStep = ({ stepNumber }: { stepNumber: number }) =>
      stepNumber === 0 ? firstStepOrder : undefined;
    const firstStep = ['weather', 'beta', 'alpha', 'zeta'];
    const laterSteps = ['zeta', 'alpha', 'beta', 'weather'];

    const coreGenerateModel = createAgentModel(responses());
    await new ToolLoopAgent({
      model: coreGenerateModel,
      tools: orderedTools(),
      toolOrder: ['zeta', 'alpha'],
      prepareStep,
    }).generate({ prompt });

    const generateModel = createAgentModel(responses());
    await new WorkflowAgent({
      model: generateModel,
      tools: orderedTools(),
      toolOrder: ['zeta', 'alpha'],
      prepareStep,
    }).generate({ prompt });

    expect(callToolNames(coreGenerateModel.doGenerateCalls)).toEqual([
      firstStep,
      laterSteps,
    ]);
    expect(callToolNames(generateModel.doGenerateCalls)).toEqual([
      firstStep,
      laterSteps,
    ]);

    const coreStreamModel = createAgentModel(responses());
    const coreStreamed = await new ToolLoopAgent({
      model: coreStreamModel,
      tools: orderedTools(),
      toolOrder: ['zeta', 'alpha'],
      prepareStep,
    }).stream({ prompt });
    await coreStreamed.consumeStream();

    const streamModel = createAgentModel(responses());
    await new WorkflowAgent({
      model: streamModel,
      tools: orderedTools(),
      toolOrder: ['zeta', 'alpha'],
      prepareStep,
    }).stream({ prompt });

    expect(callToolNames(coreStreamModel.doStreamCalls)).toEqual([
      firstStep,
      laterSteps,
    ]);
    expect(callToolNames(streamModel.doStreamCalls)).toEqual([
      firstStep,
      laterSteps,
    ]);
  });

  it('combines toolOrder with activeTools', async () => {
    const expected = ['weather', 'alpha', 'zeta'];
    const settings = {
      toolOrder: ['weather'] as const,
      activeTools: ['alpha', 'weather', 'zeta'] as const,
    };

    const coreGenerateModel = createAgentModel(responses());
    await new ToolLoopAgent({
      model: coreGenerateModel,
      tools: orderedTools(),
      ...settings,
    }).generate({ prompt });

    const generateModel = createAgentModel(responses());
    await new WorkflowAgent({
      model: generateModel,
      tools: orderedTools(),
      ...settings,
    }).generate({ prompt });

    expect(callToolNames(coreGenerateModel.doGenerateCalls)).toEqual([
      expected,
      expected,
    ]);
    expect(callToolNames(generateModel.doGenerateCalls)).toEqual([
      expected,
      expected,
    ]);

    const coreStreamModel = createAgentModel(responses());
    const coreStreamed = await new ToolLoopAgent({
      model: coreStreamModel,
      tools: orderedTools(),
      ...settings,
    }).stream({ prompt });
    await coreStreamed.consumeStream();

    const streamModel = createAgentModel(responses());
    await new WorkflowAgent({
      model: streamModel,
      tools: orderedTools(),
      ...settings,
    }).stream({ prompt });

    expect(callToolNames(coreStreamModel.doStreamCalls)).toEqual([
      expected,
      expected,
    ]);
    expect(callToolNames(streamModel.doStreamCalls)).toEqual([
      expected,
      expected,
    ]);
  });
});

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
