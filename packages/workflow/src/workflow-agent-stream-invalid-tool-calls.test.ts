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

function unknownToolResponses(): LanguageModelV4GenerateResult[] {
  return [
    {
      ...textResponse('Checking the weather.'),
      content: [
        { type: 'text', text: 'Checking the weather.' },
        {
          type: 'tool-call',
          toolCallId: 'missing-call',
          toolName: 'missing',
          input: '{"city":"London"}',
        },
      ],
      finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
    },
    textResponse('It is 18°C.'),
  ];
}

function invalidInputResponses(): LanguageModelV4GenerateResult[] {
  return [
    {
      ...textResponse('Checking the weather.'),
      content: [
        { type: 'text', text: 'Checking the weather.' },
        {
          type: 'tool-call',
          toolCallId: 'weather-call',
          toolName: 'weather',
          input: '{"city":42}',
        },
      ],
      finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
    },
    textResponse('It is 18°C.'),
  ];
}

function validToolResponses(): LanguageModelV4GenerateResult[] {
  return [toolResponse(), textResponse('It is 18°C.')];
}

const scenarios = [
  {
    name: 'an unknown tool',
    responses: unknownToolResponses,
    contentTypes: ['text', 'tool-call', 'tool-error'],
    toolCalls: [{ toolName: 'missing', invalid: true, dynamic: true }],
    chunkTypes: [
      'reset-step',
      'model-call-start',
      'model-call-response-metadata',
      'text-start',
      'text-delta',
      'text-end',
      'tool-call',
      'tool-error',
      'model-call-end',
      'finish-step',
      'start-step',
      'reset-step',
      'model-call-start',
      'model-call-response-metadata',
      'text-start',
      'text-delta',
      'text-end',
      'model-call-end',
      'finish',
    ],
  },
  {
    name: 'tool input that fails the schema',
    responses: invalidInputResponses,
    contentTypes: ['text', 'tool-call', 'tool-error'],
    toolCalls: [{ toolName: 'weather', invalid: true, dynamic: true }],
    chunkTypes: [
      'reset-step',
      'model-call-start',
      'model-call-response-metadata',
      'text-start',
      'text-delta',
      'text-end',
      'model-call-end',
      'tool-call',
      'tool-error',
      'finish-step',
      'start-step',
      'reset-step',
      'model-call-start',
      'model-call-response-metadata',
      'text-start',
      'text-delta',
      'text-end',
      'model-call-end',
      'finish',
    ],
  },
  {
    name: 'a valid tool call',
    responses: validToolResponses,
    contentTypes: ['text', 'tool-call', 'tool-result'],
    toolCalls: [{ toolName: 'weather' }],
    chunkTypes: [
      'reset-step',
      'model-call-start',
      'model-call-response-metadata',
      'text-start',
      'text-delta',
      'text-end',
      'model-call-end',
      'tool-call',
      'tool-result',
      'finish-step',
      'start-step',
      'reset-step',
      'model-call-start',
      'model-call-response-metadata',
      'text-start',
      'text-delta',
      'text-end',
      'model-call-end',
      'finish',
    ],
  },
];

describe('WorkflowAgent stream step results match ToolLoopAgent', () => {
  for (const scenario of scenarios) {
    it(`keeps the tool call for ${scenario.name}`, async () => {
      const runs = await Promise.all([
        runToolLoopAgentGenerate(scenario.responses()),
        runToolLoopAgentStream(scenario.responses()),
        runWorkflowAgentGenerate(scenario.responses()),
        runWorkflowAgentStream(scenario.responses()),
      ]);

      for (const run of runs) {
        expect(run.calls, run.label).toHaveLength(2);
      }

      const contentTypes = runs.map(run =>
        run.steps[0].content.map(part => part.type),
      );
      const toolCalls = runs.map(run =>
        run.steps[0].toolCalls.map(call => ({
          toolName: call.toolName,
          invalid: call.invalid,
          dynamic: call.dynamic,
        })),
      );
      const toolMessages = runs.map(run =>
        run.calls[1].prompt.filter(message => message.role === 'tool'),
      );

      for (const [index, run] of runs.entries()) {
        expect(contentTypes[index], run.label).toEqual(contentTypes[0]);
        expect(toolCalls[index], run.label).toEqual(toolCalls[0]);
        expect(toolMessages[index], run.label).toEqual(toolMessages[0]);
      }

      expect(contentTypes[0]).toEqual(scenario.contentTypes);
      expect(toolCalls[0]).toEqual(scenario.toolCalls);
      expect(toolMessages[0]).toHaveLength(1);
    });
  }
});

describe('WorkflowAgent stream chunks', () => {
  for (const scenario of scenarios) {
    it(`writes the same chunks for ${scenario.name}`, async () => {
      const chunks: ModelCallStreamPart[] = [];
      await new WorkflowAgent({
        model: createAgentModel(scenario.responses()),
        tools: weatherTools(),
      }).stream({
        prompt,
        writable: new WritableStream({
          write(chunk) {
            chunks.push(chunk);
          },
        }),
      });

      expect(chunks.map(chunk => chunk.type)).toEqual(scenario.chunkTypes);
    });
  }
});

async function runToolLoopAgentGenerate(
  responses: LanguageModelV4GenerateResult[],
) {
  const model = createAgentModel(responses);
  const result = await new ToolLoopAgent({
    model,
    tools: weatherTools(),
  }).generate({ prompt });

  return {
    label: 'ToolLoopAgent.generate',
    steps: result.steps,
    calls: model.doGenerateCalls,
  };
}

async function runToolLoopAgentStream(
  responses: LanguageModelV4GenerateResult[],
) {
  const model = createAgentModel(responses);
  const result = await new ToolLoopAgent({
    model,
    tools: weatherTools(),
  }).stream({ prompt });
  await result.consumeStream();

  return {
    label: 'ToolLoopAgent.stream',
    steps: await result.steps,
    calls: model.doStreamCalls,
  };
}

async function runWorkflowAgentGenerate(
  responses: LanguageModelV4GenerateResult[],
) {
  const model = createAgentModel(responses);
  const result = await new WorkflowAgent({
    model,
    tools: weatherTools(),
  }).generate({ prompt });

  return {
    label: 'WorkflowAgent.generate',
    steps: result.steps,
    calls: model.doGenerateCalls,
  };
}

async function runWorkflowAgentStream(
  responses: LanguageModelV4GenerateResult[],
) {
  const model = createAgentModel(responses);
  const result = await new WorkflowAgent({
    model,
    tools: weatherTools(),
  }).stream({ prompt });

  return {
    label: 'WorkflowAgent.stream',
    steps: result.steps,
    calls: model.doStreamCalls,
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
