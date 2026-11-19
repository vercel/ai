import type {
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { isStepCount, ToolLoopAgent, tool } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { WorkflowAgent } from './workflow-agent.js';

const prompt = 'Keep calling the weather tool.';

function weatherTools() {
  return {
    weather: tool({
      inputSchema: z.object({ city: z.string() }),
      execute: async () => ({ temperature: 18 }),
    }),
  };
}

function alwaysToolCallResponses() {
  return Array.from({ length: 25 }, () => toolResponse());
}

const emittedWarnings: string[] = [];

beforeEach(() => {
  emittedWarnings.length = 0;
  vi.spyOn(process, 'emitWarning').mockImplementation(message => {
    emittedWarnings.push(String(message));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function defaultLimitWarnings() {
  return emittedWarnings.filter(message =>
    message.includes('default stopWhen condition'),
  );
}

describe('default step limit warning', () => {
  it('warns once when both agents stop at the default limit', async () => {
    const responses = alwaysToolCallResponses();
    const core = await new ToolLoopAgent({
      model: createAgentModel(responses),
      tools: weatherTools(),
    }).generate({ prompt });
    const coreWarnings = defaultLimitWarnings();

    const workflow = await new WorkflowAgent({
      model: createAgentModel(responses),
      tools: weatherTools(),
    }).generate({ prompt });
    const workflowWarnings = defaultLimitWarnings().slice(coreWarnings.length);

    expect(core.steps).toHaveLength(20);
    expect(workflow.steps).toHaveLength(20);
    expect(coreWarnings).toHaveLength(1);
    expect(workflowWarnings).toHaveLength(1);
    expect(coreWarnings[0]).toContain(
      'The tool loop stopped because it reached the default stopWhen condition, isStepCount(20).',
    );
    expect(workflowWarnings[0]).toBe(coreWarnings[0]);
  });

  it('does not warn when the model finishes naturally on step 20', async () => {
    const responses = [
      ...Array.from({ length: 19 }, () => toolResponse()),
      textResponse('Done.'),
    ];
    const core = await new ToolLoopAgent({
      model: createAgentModel(responses),
      tools: weatherTools(),
    }).generate({ prompt });
    const workflow = await new WorkflowAgent({
      model: createAgentModel(responses),
      tools: weatherTools(),
    }).generate({ prompt });

    expect(core.steps).toHaveLength(20);
    expect(workflow.steps).toHaveLength(20);
    expect(defaultLimitWarnings()).toEqual([]);
  });

  it('does not warn when step 20 has only a provider-executed tool call', async () => {
    const providerToolResponse: LanguageModelV4GenerateResult = {
      ...textResponse('Checked by the provider.'),
      content: [
        {
          type: 'tool-call',
          toolCallId: 'provider-call',
          toolName: 'weather',
          input: '{"city":"London"}',
          providerExecuted: true,
        },
        {
          type: 'tool-result',
          toolCallId: 'provider-call',
          toolName: 'weather',
          result: { temperature: 18 },
        },
      ],
      finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
    };
    const responses = [
      ...Array.from({ length: 19 }, () => toolResponse()),
      providerToolResponse,
    ];

    const core = await new ToolLoopAgent({
      model: new MockLanguageModelV4({ doGenerate: responses }),
      tools: weatherTools(),
    }).generate({ prompt });
    const workflow = await new WorkflowAgent({
      model: new MockLanguageModelV4({ doGenerate: responses }),
      tools: weatherTools(),
    }).generate({ prompt });

    expect(core.steps).toHaveLength(20);
    expect(workflow.steps).toHaveLength(20);
    expect(defaultLimitWarnings()).toEqual([]);
  });

  it('does not warn for an explicit default limit in the constructor', async () => {
    const responses = alwaysToolCallResponses();
    const core = await new ToolLoopAgent({
      model: createAgentModel(responses),
      tools: weatherTools(),
      stopWhen: isStepCount(20),
    }).generate({ prompt });
    const workflow = await new WorkflowAgent({
      model: createAgentModel(responses),
      tools: weatherTools(),
      stopWhen: isStepCount(20),
    }).generate({ prompt });

    expect(core.steps).toHaveLength(20);
    expect(workflow.steps).toHaveLength(20);
    expect(defaultLimitWarnings()).toEqual([]);
  });

  it('does not warn for an explicit default limit on the call', async () => {
    const workflow = await new WorkflowAgent({
      model: createAgentModel(alwaysToolCallResponses()),
      tools: weatherTools(),
    }).generate({ prompt, stopWhen: isStepCount(20) });

    expect(workflow.steps).toHaveLength(20);
    expect(defaultLimitWarnings()).toEqual([]);
  });

  it('does not warn when prepareCall provides a stop condition', async () => {
    const workflow = await new WorkflowAgent({
      model: createAgentModel(alwaysToolCallResponses()),
      tools: weatherTools(),
      prepareCall: () => ({ stopWhen: isStepCount(20) }),
    }).generate({ prompt });

    expect(workflow.steps).toHaveLength(20);
    expect(defaultLimitWarnings()).toEqual([]);
  });

  it('warns when prepareCall returns the default stop condition it received', async () => {
    const responses = alwaysToolCallResponses();
    const core = await new ToolLoopAgent({
      model: createAgentModel(responses),
      tools: weatherTools(),
      prepareCall: settings => settings,
    }).generate({ prompt });
    const coreWarnings = defaultLimitWarnings();

    const workflow = await new WorkflowAgent({
      model: createAgentModel(responses),
      tools: weatherTools(),
      prepareCall: ({ stopWhen }) => ({ stopWhen }),
    }).generate({ prompt });
    const workflowWarnings = defaultLimitWarnings().slice(coreWarnings.length);

    expect(core.steps).toHaveLength(20);
    expect(workflow.steps).toHaveLength(20);
    expect(coreWarnings).toHaveLength(1);
    expect(workflowWarnings).toEqual(coreWarnings);
  });

  it('does not warn when stream sets an explicit limit', async () => {
    const workflow = await new WorkflowAgent({
      model: createAgentModel(alwaysToolCallResponses()),
      tools: weatherTools(),
    }).stream({ prompt, stopWhen: isStepCount(25) });

    expect(workflow.steps).toHaveLength(25);
    expect(defaultLimitWarnings()).toEqual([]);
  });
});

/**
 * The same scripted responses for core generate and Workflow stream tests.
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
