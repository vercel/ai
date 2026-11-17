import type {
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
  SharedV4Warning,
} from '@ai-sdk/provider';
import { ToolLoopAgent, tool } from 'ai';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { WorkflowAgent } from './workflow-agent.js';

const prompt = 'What is the weather in London?';

const warning: SharedV4Warning = {
  type: 'unsupported',
  feature: 'temperature',
};

const warningMessage =
  'AI SDK Warning (mock-provider / mock-model-id): The feature "temperature" is not supported.';

// Keep the default logger quiet while recording what it emits. The default
// logger emits a one-time information message before the first warning, so the
// helpers below only return provider warning messages.
const emitWarning = vi
  .spyOn(process, 'emitWarning')
  .mockImplementation(() => {});

function loggedWarnings(): string[] {
  return emitWarning.mock.calls
    .map(call => String(call[0]))
    .filter(message => message.startsWith('AI SDK Warning ('));
}

type AgentRun = [name: string, run: () => Promise<unknown>];

function agentRuns(responses: LanguageModelV4GenerateResult[]): AgentRun[] {
  const agentSettings = () => ({
    model: createAgentModel(responses),
    tools: weatherTools(),
  });

  return [
    [
      'ToolLoopAgent.generate',
      () => new ToolLoopAgent(agentSettings()).generate({ prompt }),
    ],
    [
      'ToolLoopAgent.stream',
      async () => {
        const result = await new ToolLoopAgent(agentSettings()).stream({
          prompt,
        });
        await result.consumeStream();
      },
    ],
    [
      'WorkflowAgent.generate',
      () => new WorkflowAgent(agentSettings()).generate({ prompt }),
    ],
    [
      'WorkflowAgent.stream',
      () => new WorkflowAgent(agentSettings()).stream({ prompt }),
    ],
  ];
}

describe('WorkflowAgent provider warnings', () => {
  beforeEach(() => {
    emitWarning.mockClear();
  });

  afterEach(() => {
    delete globalThis.AI_SDK_LOG_WARNINGS;
  });

  it('logs the warning of a model call once, like ToolLoopAgent', async () => {
    for (const [name, run] of agentRuns([textResponse('Done.', [warning])])) {
      emitWarning.mockClear();
      await run();
      expect(loggedWarnings(), name).toEqual([warningMessage]);
    }
  });

  it('logs the warning of every model call in a two-step run', async () => {
    const responses = [
      toolResponse([warning]),
      textResponse('It is 18°C.', [warning]),
    ];

    for (const [name, run] of agentRuns(responses)) {
      emitWarning.mockClear();
      await run();
      expect(loggedWarnings(), name).toEqual([warningMessage, warningMessage]);
    }
  });

  it('logs nothing when AI_SDK_LOG_WARNINGS is false', async () => {
    globalThis.AI_SDK_LOG_WARNINGS = false;

    for (const [name, run] of agentRuns([textResponse('Done.', [warning])])) {
      emitWarning.mockClear();
      await run();
      expect(emitWarning, name).not.toHaveBeenCalled();
    }
  });

  it('passes the same warnings, provider, and model to a custom logger', async () => {
    const logger = vi.fn();
    globalThis.AI_SDK_LOG_WARNINGS = logger;

    for (const [name, run] of agentRuns([textResponse('Done.', [warning])])) {
      logger.mockClear();
      await run();
      expect(logger, name).toHaveBeenCalledTimes(1);
      expect(logger, name).toHaveBeenCalledWith({
        warnings: [warning],
        provider: 'mock-provider',
        model: 'mock-model-id',
      });
    }
  });

  it('logs nothing when the model returns no warnings', async () => {
    for (const [name, run] of agentRuns([textResponse('Done.')])) {
      emitWarning.mockClear();
      await run();
      expect(emitWarning, name).not.toHaveBeenCalled();
    }
  });
});

function weatherTools() {
  return {
    weather: tool({
      inputSchema: z.object({ city: z.string() }),
      execute: async () => ({ temperature: 18 }),
    }),
  };
}

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

function textResponse(
  text: string,
  warnings: SharedV4Warning[] = [],
): LanguageModelV4GenerateResult {
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
    warnings,
    response: {
      id: 'response-fixture',
      timestamp: new Date(0),
      modelId: 'mock-model-id',
    },
  };
}

function toolResponse(
  warnings: SharedV4Warning[] = [],
): LanguageModelV4GenerateResult {
  return {
    ...textResponse('Checking the weather.', warnings),
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
