import type {
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { tool, ToolLoopAgent } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { buildModelStepResult } from './build-model-step-result.js';
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
  responseModelId = 'mock-model-id',
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
    warnings: [],
    response: {
      id: 'response-fixture',
      timestamp: new Date(0),
      modelId: responseModelId,
    },
  };
}

function toolResponse(
  responseModelId = 'mock-model-id',
): LanguageModelV4GenerateResult {
  return {
    ...textResponse('Checking the weather.', responseModelId),
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

function expectedStepModels() {
  return [
    { provider: 'mock-provider', modelId: 'mock-model-id' },
    { provider: 'mock-provider', modelId: 'mock-model-id' },
  ];
}

describe('WorkflowAgent stream step model', () => {
  it('reports the model that produced each step like ToolLoopAgent and generate', async () => {
    const responses = [toolResponse(), textResponse('It is 18°C.')];

    const core = await new ToolLoopAgent({
      model: createAgentModel(responses),
      tools: weatherTools(),
    }).stream({ prompt });
    await core.consumeStream();
    const coreSteps = await core.steps;

    const generated = await new WorkflowAgent({
      model: createAgentModel(responses),
      tools: weatherTools(),
    }).generate({ prompt });

    const streamed = await new WorkflowAgent({
      model: createAgentModel(responses),
      tools: weatherTools(),
    }).stream({ prompt });

    expect(coreSteps.map(step => step.model)).toEqual(expectedStepModels());
    expect(generated.steps.map(step => step.model)).toEqual(
      expectedStepModels(),
    );
    expect(streamed.steps.map(step => step.model)).toEqual(
      expectedStepModels(),
    );
    expect(streamed.steps.map(step => step.model)).toEqual(
      coreSteps.map(step => step.model),
    );
  });

  it('reports the configured model when the response carries a different model ID', async () => {
    const responseModelId = 'mock-model-id-2026-01-01';
    const responses = [
      toolResponse(responseModelId),
      textResponse('It is 18°C.', responseModelId),
    ];

    const core = await new ToolLoopAgent({
      model: createAgentModel(responses),
      tools: weatherTools(),
    }).stream({ prompt });
    await core.consumeStream();
    const coreSteps = await core.steps;

    const generated = await new WorkflowAgent({
      model: createAgentModel(responses),
      tools: weatherTools(),
    }).generate({ prompt });

    const streamed = await new WorkflowAgent({
      model: createAgentModel(responses),
      tools: weatherTools(),
    }).stream({ prompt });

    expect(streamed.steps.map(step => step.response.modelId)).toEqual([
      responseModelId,
      responseModelId,
    ]);
    expect(coreSteps.map(step => step.model)).toEqual(expectedStepModels());
    expect(generated.steps.map(step => step.model)).toEqual(
      expectedStepModels(),
    );
    expect(streamed.steps.map(step => step.model)).toEqual(
      expectedStepModels(),
    );
    expect(streamed.steps.map(step => step.model)).toEqual(
      coreSteps.map(step => step.model),
    );
  });

  it('derives the model from the response metadata for stream results without model information', async () => {
    const step = await buildModelStepResult(
      {
        content: [{ type: 'text', text: 'It is 18°C.' }],
        reasoning: [],
        responseMetadata: { modelId: 'mock-provider:mock-model-id' },
      },
      [],
      undefined,
      new Map(),
      { stepNumber: 0, runtimeContext: {}, toolsContext: {} },
    );

    expect(step.model).toEqual({
      provider: 'mock-provider',
      modelId: 'mock-provider:mock-model-id',
    });
  });
});
