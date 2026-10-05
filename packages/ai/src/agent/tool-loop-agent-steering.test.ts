import type { LanguageModelV4Usage } from '@ai-sdk/provider';
import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { SteeringController } from '../generate-text/steering-controller';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { ToolLoopAgent } from './tool-loop-agent';

const testUsage: LanguageModelV4Usage = {
  inputTokens: {
    total: 5,
    noCache: 5,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 10,
    text: 10,
    reasoning: undefined,
  },
};

const dummyResponseValues = {
  finishReason: { unified: 'stop', raw: 'stop' } as const,
  usage: testUsage,
  warnings: [],
};

describe('ToolLoopAgent with SteeringController', () => {
  it('should pass experimental_steeringSignal through agent.generate()', async () => {
    const controller = new SteeringController();
    let stepCount = 0;
    let steerPromise: Promise<unknown> | undefined;

    const agent = new ToolLoopAgent({
      model: new MockLanguageModelV4({
        doGenerate: async () => {
          stepCount++;
          if (stepCount === 1) {
            steerPromise = controller.steer('Steer agent generate');
            return {
              ...dummyResponseValues,
              content: [{ type: 'text', text: 'agent step 0' }],
            };
          }

          return {
            ...dummyResponseValues,
            content: [{ type: 'text', text: 'agent step 1' }],
          };
        },
      }),
    });

    const resultPromise = agent.generate({
      prompt: 'hello agent',
      experimental_steeringSignal: controller.signal,
    });

    const result = await resultPromise;
    const receipt = await steerPromise;

    expect(receipt).toEqual({ stepNumber: 1 });
    expect(stepCount).toBe(2);
    expect(result.steps).toHaveLength(2);
    expect(result.steps[1].text).toBe('agent step 1');
  });

  it('should pass experimental_steeringSignal through agent.stream()', async () => {
    const controller = new SteeringController();
    let stepCount = 0;
    let steerPromise: Promise<unknown> | undefined;

    const agent = new ToolLoopAgent({
      model: new MockLanguageModelV4({
        doStream: async () => {
          stepCount++;
          if (stepCount === 1) {
            steerPromise = controller.steer('Steer agent stream');
            return {
              stream: convertArrayToReadableStream([
                { type: 'text-start', id: '1' },
                { type: 'text-delta', id: '1', delta: 'stream 0 ' },
                { type: 'text-end', id: '1' },
                {
                  type: 'finish',
                  finishReason: { unified: 'stop', raw: 'stop' },
                  usage: testUsage,
                },
              ]),
            };
          }

          return {
            stream: convertArrayToReadableStream([
              { type: 'text-start', id: '2' },
              { type: 'text-delta', id: '2', delta: 'stream 1' },
              { type: 'text-end', id: '2' },
              {
                type: 'finish',
                finishReason: { unified: 'stop', raw: 'stop' },
                usage: testUsage,
              },
            ]),
          };
        },
      }),
    });

    const result = await agent.stream({
      prompt: 'stream agent',
      experimental_steeringSignal: controller.signal,
    });

    const chunks: string[] = [];
    for await (const chunk of result.textStream) {
      chunks.push(chunk);
    }

    const receipt = await steerPromise;
    expect(receipt).toEqual({ stepNumber: 1 });
    expect(chunks.join('')).toBe('stream 0 stream 1');
    expect(stepCount).toBe(2);
  });
});
