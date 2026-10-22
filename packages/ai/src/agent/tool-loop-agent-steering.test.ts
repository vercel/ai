import type {
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import { tool } from '@ai-sdk/provider-utils';
import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import {
  createSteering,
  type SteeringOutcome,
} from '../generate-text/steering';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import type { Agent } from './agent';
import { createAgentUIStream } from './create-agent-ui-stream';
import { ToolLoopAgent } from './tool-loop-agent';

vi.mock('../version', () => ({ VERSION: '0.0.0-test' }));

const usage: LanguageModelV4Usage = {
  inputTokens: {
    total: 3,
    noCache: 3,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 10, text: 10, reasoning: undefined },
};

const textStream = (text: string): Array<LanguageModelV4StreamPart> => [
  { type: 'stream-start', warnings: [] },
  { type: 'text-start', id: '1' },
  { type: 'text-delta', id: '1', delta: text },
  { type: 'text-end', id: '1' },
  { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage },
];

const textResponse = (text: string): LanguageModelV4GenerateResult => ({
  content: [{ type: 'text', text }],
  finishReason: { unified: 'stop', raw: 'stop' },
  usage,
  warnings: [],
});

describe('ToolLoopAgent experimental_steering', () => {
  it('should deliver messages in generate() with the default stop condition', async () => {
    const steering = createSteering();
    let outcome: Promise<SteeringOutcome> | undefined;
    let call = 0;

    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        if (call++ === 0) {
          outcome = steering.steer('Also tell me about Tokyo.');
          return textResponse('It is sunny in Paris.');
        }
        return textResponse('Tokyo is rainy.');
      },
    });

    const agent = new ToolLoopAgent({ model });

    const result = await agent.generate({
      prompt: 'What is the weather in Paris?',
      experimental_steering: steering,
    });

    expect(result.text).toBe('Tokyo is rainy.');
    expect(await outcome).toMatchObject({ type: 'delivered', stepNumber: 1 });
  });

  it('should deliver messages in stream()', async () => {
    const steering = createSteering();
    let outcome: Promise<SteeringOutcome> | undefined;
    let call = 0;

    const model = new MockLanguageModelV4({
      doStream: async () => {
        if (call++ === 0) {
          outcome = steering.steer('Also tell me about Tokyo.');
          return { stream: convertArrayToReadableStream(textStream('Sunny.')) };
        }
        return {
          stream: convertArrayToReadableStream(textStream('Tokyo is rainy.')),
        };
      },
    });

    const agent = new ToolLoopAgent({
      model,
      tools: {
        weather: tool({
          inputSchema: z.object({ city: z.string() }),
          execute: async () => 'sunny',
        }),
      },
    });

    const result = await agent.stream({
      prompt: 'What is the weather in Paris?',
      experimental_steering: steering,
    });

    expect(await result.text).toBe('Tokyo is rainy.');
    expect(await outcome).toMatchObject({ type: 'delivered', stepNumber: 1 });
  });

  it('should not pass the steering object to prepareCall', async () => {
    const steering = createSteering();
    const prepareCall = vi.fn(options => options);

    const agent = new ToolLoopAgent({
      model: new MockLanguageModelV4({
        doGenerate: async () => textResponse('done'),
      }),
      prepareCall,
    });

    await agent.generate({ prompt: 'hello', experimental_steering: steering });

    expect(prepareCall.mock.calls[0][0]).not.toHaveProperty(
      'experimental_steering',
    );
  });

  it('should deliver messages through createAgentUIStream', async () => {
    const steering = createSteering();
    let outcome: Promise<SteeringOutcome> | undefined;
    let call = 0;

    const model = new MockLanguageModelV4({
      doStream: async () => {
        if (call++ === 0) {
          outcome = steering.steer('Also tell me about Tokyo.');
          return { stream: convertArrayToReadableStream(textStream('Sunny.')) };
        }
        return {
          stream: convertArrayToReadableStream(textStream('Tokyo is rainy.')),
        };
      },
    });

    const stream = await createAgentUIStream({
      agent: new ToolLoopAgent({ model }),
      uiMessages: [
        {
          id: 'message-1',
          role: 'user',
          parts: [{ type: 'text', text: 'What is the weather in Paris?' }],
        },
      ],
      experimental_steering: steering,
    });

    await stream.pipeTo(new WritableStream());

    expect(model.doStreamCalls).toHaveLength(2);
    expect(await outcome).toMatchObject({ type: 'delivered', stepNumber: 1 });
  });

  it('should throw when createAgentUIStream gets a steering object with an agent that is not a ToolLoopAgent', async () => {
    const stream = vi.fn();
    const agent: Agent = {
      version: 'agent-v1',
      id: undefined,
      tools: {},
      generate: vi.fn(),
      stream,
    };

    await expect(
      createAgentUIStream({
        agent,
        uiMessages: [
          {
            id: 'message-1',
            role: 'user',
            parts: [{ type: 'text', text: 'hello' }],
          },
        ],
        experimental_steering: createSteering(),
      }),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `[AI_InvalidArgumentError: Invalid argument for parameter experimental_steering: Steering is only supported by ToolLoopAgent.]`,
    );
    expect(stream).not.toHaveBeenCalled();
  });
});
