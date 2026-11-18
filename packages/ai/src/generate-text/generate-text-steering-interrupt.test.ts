import type {
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import { tool } from '@ai-sdk/provider-utils';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { generateText } from './generate-text';
import { createSteering, type SteeringOutcome } from './steering';
import { isStepCount } from './stop-condition';

vi.mock('../version', () => ({ VERSION: '0.0.0-test' }));

const usage = (output: number): LanguageModelV4Usage => ({
  inputTokens: {
    total: 3,
    noCache: 3,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: output, text: output, reasoning: undefined },
});

const textResponse = (text: string): LanguageModelV4GenerateResult => ({
  content: [{ type: 'text', text }],
  finishReason: { unified: 'stop', raw: 'stop' },
  usage: usage(10),
  warnings: [],
});

const toolCallResponse: LanguageModelV4GenerateResult = {
  content: [
    {
      type: 'tool-call',
      toolCallId: 'call-1',
      toolName: 'weather',
      input: '{ "city": "Paris" }',
    },
  ],
  finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
  usage: usage(5),
  warnings: [],
};

function lastUserText(options: LanguageModelV4CallOptions) {
  const message = options.prompt.at(-1)!;
  return message.role === 'user' && message.content[0].type === 'text'
    ? message.content[0].text
    : undefined;
}

function waitForAbort(options: LanguageModelV4CallOptions) {
  return new Promise<never>((_, reject) => {
    const signal = options.abortSignal!;
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    signal.addEventListener('abort', () => reject(signal.reason), {
      once: true,
    });
  });
}

function createHangingFirstCall({
  onFirstCall,
  responses,
}: {
  onFirstCall: (options: LanguageModelV4CallOptions) => void;
  responses: Array<
    (options: LanguageModelV4CallOptions) => LanguageModelV4GenerateResult
  >;
}) {
  const calls: LanguageModelV4CallOptions[] = [];
  const model = new MockLanguageModelV4({
    doGenerate: async options => {
      calls.push(options);
      if (calls.length === 1) {
        onFirstCall(options);
        return waitForAbort(options);
      }
      return responses[calls.length - 2](options);
    },
  });
  return { model, calls };
}

describe('generateText experimental_steering interrupt', () => {
  it('should cancel a model call without output and redo it in the same step with the message', async () => {
    const steering = createSteering();
    let outcome: Promise<SteeringOutcome> | undefined;

    const { model, calls } = createHangingFirstCall({
      onFirstCall: () => {
        outcome = steering.steer('Use Paris, Texas instead.', {
          interrupt: true,
        });
      },
      responses: [() => textResponse('It is sunny in Paris, Texas.')],
    });

    const result = await generateText({
      model,
      prompt: 'What is the weather in Paris?',
      experimental_steering: steering,
    });

    expect(calls).toHaveLength(2);
    expect(calls[0].abortSignal?.aborted).toBe(true);
    expect(lastUserText(calls[1])).toBe('Use Paris, Texas instead.');
    expect(result.steps).toHaveLength(1);
    expect(result.text).toBe('It is sunny in Paris, Texas.');
    expect(result.steps[0].experimental_steeringMessages).toEqual([
      { role: 'user', content: 'Use Paris, Texas instead.' },
    ]);
    // the cancelled call is left out of the usage:
    expect(result.totalUsage.outputTokens).toBe(10);
    expect(await outcome).toMatchObject({
      type: 'delivered',
      stepNumber: 0,
    });
  });

  it('should keep steering messages that the step already delivered in the redo', async () => {
    const steering = createSteering();
    const earlier = steering.steer('Answer in Celsius.');
    let interrupt: Promise<SteeringOutcome> | undefined;

    const { model, calls } = createHangingFirstCall({
      onFirstCall: () => {
        interrupt = steering.steer('Use Paris, Texas instead.', {
          interrupt: true,
        });
      },
      responses: [() => textResponse('It is 22 degrees in Paris, Texas.')],
    });

    const result = await generateText({
      model,
      prompt: 'What is the weather in Paris?',
      experimental_steering: steering,
    });

    const userTexts = calls[1].prompt
      .filter(message => message.role === 'user')
      .map(message =>
        message.content[0].type === 'text' ? message.content[0].text : '',
      );
    expect(userTexts).toEqual([
      'What is the weather in Paris?',
      'Answer in Celsius.',
      'Use Paris, Texas instead.',
    ]);
    expect(result.steps[0].experimental_steeringMessages).toEqual([
      { role: 'user', content: 'Answer in Celsius.' },
      { role: 'user', content: 'Use Paris, Texas instead.' },
    ]);
    expect(await earlier).toMatchObject({ type: 'delivered', stepNumber: 0 });
    expect(await interrupt).toMatchObject({ type: 'delivered', stepNumber: 0 });
  });

  it('should redo the step for every interrupt and keep the messages in order', async () => {
    const steering = createSteering();
    const outcomes: Array<Promise<SteeringOutcome>> = [];
    const calls: LanguageModelV4CallOptions[] = [];

    const result = await generateText({
      model: new MockLanguageModelV4({
        doGenerate: async options => {
          calls.push(options);
          if (calls.length <= 2) {
            outcomes.push(
              steering.steer(`Correction ${calls.length}.`, {
                interrupt: true,
              }),
            );
            return waitForAbort(options);
          }
          return textResponse('It is sunny in Paris, Texas.');
        },
      }),
      prompt: 'What is the weather in Paris?',
      experimental_steering: steering,
    });

    expect(calls).toHaveLength(3);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].experimental_steeringMessages).toEqual([
      { role: 'user', content: 'Correction 1.' },
      { role: 'user', content: 'Correction 2.' },
    ]);
    expect(await Promise.all(outcomes)).toMatchObject([
      { type: 'delivered', stepNumber: 0 },
      { type: 'delivered', stepNumber: 0 },
    ]);
  });

  it('should redo a later step with the tool results of the step before it', async () => {
    const steering = createSteering();
    let outcome: Promise<SteeringOutcome> | undefined;
    const calls: LanguageModelV4CallOptions[] = [];
    const execute = vi.fn(async () => ({ temperature: 72 }));

    const result = await generateText({
      model: new MockLanguageModelV4({
        doGenerate: async options => {
          calls.push(options);
          if (calls.length === 1) {
            return toolCallResponse;
          }
          if (calls.length === 2) {
            outcome = steering.steer('Answer in Celsius.', {
              interrupt: true,
            });
            return waitForAbort(options);
          }
          return textResponse('It is 22 degrees in Paris.');
        },
      }),
      prompt: 'What is the weather in Paris?',
      tools: {
        weather: tool({
          inputSchema: z.object({ city: z.string() }),
          execute,
        }),
      },
      stopWhen: isStepCount(3),
      experimental_steering: steering,
    });

    expect(calls).toHaveLength(3);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(calls[2].prompt.map(message => message.role)).toEqual([
      'user',
      'assistant',
      'tool',
      'user',
    ]);
    expect(lastUserText(calls[2])).toBe('Answer in Celsius.');
    expect(result.steps).toHaveLength(2);
    expect(await outcome).toMatchObject({ type: 'delivered', stepNumber: 1 });
  });

  it('should run prepareStep again for the redo, notify onStepStart once, and start two model calls', async () => {
    const steering = createSteering();
    const prepareStep = vi.fn(() => undefined);
    const onStepStart = vi.fn();
    const onLanguageModelCallStart = vi.fn();
    const onLanguageModelCallEnd = vi.fn();

    const { model } = createHangingFirstCall({
      onFirstCall: () => {
        void steering.steer('Use Paris, Texas instead.', { interrupt: true });
      },
      responses: [() => textResponse('It is sunny in Paris, Texas.')],
    });

    await generateText({
      model,
      prompt: 'What is the weather in Paris?',
      experimental_steering: steering,
      prepareStep,
      onStepStart,
      onLanguageModelCallStart,
      onLanguageModelCallEnd,
    });

    expect(prepareStep).toHaveBeenCalledTimes(2);
    expect(
      (
        prepareStep.mock.calls[1] as unknown[] as [
          { stepNumber: number; experimental_steeringMessages?: unknown },
        ]
      )[0],
    ).toMatchObject({
      stepNumber: 0,
      experimental_steeringMessages: [
        { role: 'user', content: 'Use Paris, Texas instead.' },
      ],
    });
    expect(onStepStart).toHaveBeenCalledTimes(1);
    expect(onLanguageModelCallStart).toHaveBeenCalledTimes(2);
    expect(onLanguageModelCallEnd).toHaveBeenCalledTimes(1);
  });

  it('should run prepareStep for the redo with the instructions and contexts that the step started with', async () => {
    const steering = createSteering();
    const prepareStepInputs: Array<unknown> = [];

    const { model, calls } = createHangingFirstCall({
      onFirstCall: () => {
        void steering.steer('Use Paris, Texas instead.', { interrupt: true });
      },
      responses: [() => textResponse('It is sunny in Paris, Texas.')],
    });

    await generateText({
      model,
      instructions: 'Answer briefly.',
      prompt: 'What is the weather in Paris?',
      tools: {
        weather: tool({
          inputSchema: z.object({ city: z.string() }),
          contextSchema: z.object({ unit: z.string() }),
          execute: async () => ({ temperature: 72 }),
        }),
      },
      runtimeContext: { prepareStepCalls: 0 },
      toolsContext: { weather: { unit: 'fahrenheit' } },
      experimental_steering: steering,
      prepareStep: ({ instructions, runtimeContext, toolsContext }) => {
        prepareStepInputs.push({ instructions, runtimeContext, toolsContext });
        return {
          instructions: `${instructions} Use Celsius.`,
          runtimeContext: {
            prepareStepCalls: runtimeContext.prepareStepCalls + 1,
          },
          toolsContext: { weather: { unit: 'celsius' } },
        };
      },
    });

    const stepStartState = {
      instructions: 'Answer briefly.',
      runtimeContext: { prepareStepCalls: 0 },
      toolsContext: { weather: { unit: 'fahrenheit' } },
    };
    expect(prepareStepInputs).toEqual([stepStartState, stepStartState]);
    expect(calls[1].prompt[0]).toEqual({
      role: 'system',
      content: 'Answer briefly. Use Celsius.',
    });
  });

  it('should not deliver an interrupt message that prepareStep removes on the redo', async () => {
    const steering = createSteering();
    let outcome: Promise<SteeringOutcome> | undefined;

    const { model, calls } = createHangingFirstCall({
      onFirstCall: () => {
        outcome = steering.steer('Use Paris, Texas instead.', {
          interrupt: true,
        });
      },
      responses: [() => textResponse('It is sunny in Paris.')],
    });

    await generateText({
      model,
      prompt: 'What is the weather in Paris?',
      experimental_steering: steering,
      prepareStep: ({ messages }) => ({
        messages: messages.filter(
          message => message.content !== 'Use Paris, Texas instead.',
        ),
      }),
    });

    expect(calls).toHaveLength(2);
    expect(lastUserText(calls[1])).toBe('What is the weather in Paris?');
    expect(await outcome).toMatchObject({
      type: 'not-delivered',
      reason: 'removed-by-prepare-step',
    });
  });

  it('should interrupt for a message sent during prepareStep', async () => {
    const steering = createSteering();
    let outcome: Promise<SteeringOutcome> | undefined;

    const { model, calls } = createHangingFirstCall({
      onFirstCall: () => {},
      responses: [() => textResponse('It is sunny in Paris, Texas.')],
    });

    await generateText({
      model,
      prompt: 'What is the weather in Paris?',
      experimental_steering: steering,
      prepareStep: () => {
        outcome ??= steering.steer('Use Paris, Texas instead.', {
          interrupt: true,
        });
        return undefined;
      },
    });

    expect(calls).toHaveLength(2);
    expect(lastUserText(calls[1])).toBe('Use Paris, Texas instead.');
    expect(await outcome).toMatchObject({
      type: 'delivered',
      stepNumber: 0,
    });
  });

  it('should deliver an interrupt message sent before the run in the first step without an extra call', async () => {
    const steering = createSteering();
    const outcome = steering.steer('Use Paris, Texas instead.', {
      interrupt: true,
    });
    const doGenerate = vi.fn(async () => textResponse('Sunny.'));

    await generateText({
      model: new MockLanguageModelV4({ doGenerate }),
      prompt: 'What is the weather in Paris?',
      experimental_steering: steering,
    });

    expect(doGenerate).toHaveBeenCalledTimes(1);
    expect(await outcome).toMatchObject({
      type: 'delivered',
      stepNumber: 0,
    });
  });

  it('should fall back to the next step and let tools finish when the model call already returned', async () => {
    const steering = createSteering();
    let outcome: Promise<SteeringOutcome> | undefined;
    const execute = vi.fn(async () => {
      outcome = steering.steer('Use Paris, Texas instead.', {
        interrupt: true,
      });
      await new Promise(resolve => setTimeout(resolve, 5));
      return { temperature: 72 };
    });
    let call = 0;
    const doGenerate = vi.fn(async (options: LanguageModelV4CallOptions) => {
      call++;
      return call === 1
        ? toolCallResponse
        : textResponse(`answer for ${lastUserText(options)}`);
    });

    const result = await generateText({
      model: new MockLanguageModelV4({ doGenerate }),
      prompt: 'What is the weather in Paris?',
      tools: {
        weather: tool({
          inputSchema: z.object({ city: z.string() }),
          execute,
        }),
      },
      stopWhen: isStepCount(3),
      experimental_steering: steering,
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.steps[0].toolResults[0].output).toEqual({ temperature: 72 });
    expect(doGenerate).toHaveBeenCalledTimes(2);
    expect(await outcome).toMatchObject({
      type: 'delivered',
      stepNumber: 1,
    });
  });

  it('should not cancel the model call for a steer without interrupt', async () => {
    const steering = createSteering();
    let outcome: Promise<SteeringOutcome> | undefined;
    let call = 0;
    const doGenerate = vi.fn(async (options: LanguageModelV4CallOptions) => {
      call++;
      if (call === 1) {
        outcome = steering.steer('Use Paris, Texas instead.');
        await new Promise(resolve => setTimeout(resolve, 5));
        expect(options.abortSignal?.aborted ?? false).toBe(false);
        return textResponse('It is sunny in Paris.');
      }
      return textResponse('It is sunny in Paris, Texas.');
    });

    const result = await generateText({
      model: new MockLanguageModelV4({ doGenerate }),
      prompt: 'What is the weather in Paris?',
      stopWhen: isStepCount(3),
      experimental_steering: steering,
    });

    expect(result.steps).toHaveLength(2);
    expect(await outcome).toMatchObject({
      type: 'delivered',
      stepNumber: 1,
    });
  });

  it('should treat a caller abort as an abort and not as an interrupt', async () => {
    const steering = createSteering();
    const controller = new AbortController();
    let outcome: Promise<SteeringOutcome> | undefined;
    const doGenerate = vi.fn(async (options: LanguageModelV4CallOptions) => {
      outcome = steering.steer('Use Paris, Texas instead.', {
        interrupt: true,
      });
      controller.abort(new Error('stopped by user'));
      return waitForAbort(options);
    });

    await expect(
      generateText({
        model: new MockLanguageModelV4({ doGenerate }),
        prompt: 'What is the weather in Paris?',
        abortSignal: controller.signal,
        experimental_steering: steering,
      }),
    ).rejects.toThrow('stopped by user');

    expect(doGenerate).toHaveBeenCalledTimes(1);
    expect(await outcome).toMatchObject({
      type: 'not-delivered',
      reason: 'aborted',
    });
  });

  it('should only interrupt once for a message sent again with the same id', async () => {
    const steering = createSteering();

    const { model, calls } = createHangingFirstCall({
      onFirstCall: () => {
        void steering.steer('Use Paris, Texas instead.', {
          id: 'steer-1',
          interrupt: true,
        });
      },
      responses: [
        () => {
          void steering.steer('Use Paris, Texas instead.', {
            id: 'steer-1',
            interrupt: true,
          });
          return textResponse('It is sunny in Paris, Texas.');
        },
      ],
    });

    const result = await generateText({
      model,
      prompt: 'What is the weather in Paris?',
      experimental_steering: steering,
    });

    expect(calls).toHaveLength(2);
    expect(result.steps).toHaveLength(1);
  });

  it('should keep the step timeout running across the redo', async () => {
    vi.useFakeTimers();
    try {
      const steering = createSteering();
      let calls = 0;
      let rejected = false;

      const run = generateText({
        model: new MockLanguageModelV4({
          doGenerate: async options => {
            calls++;
            return waitForAbort(options);
          },
        }),
        prompt: 'What is the weather in Paris?',
        timeout: { stepMs: 200 },
        experimental_steering: steering,
      }).catch(() => {
        rejected = true;
      });

      await vi.advanceTimersByTimeAsync(120);
      void steering.steer('Use Paris, Texas instead.', { interrupt: true });

      // a timeout that started again with the redo would end after 320ms:
      await vi.advanceTimersByTimeAsync(79);
      expect(calls).toBe(2);
      expect(rejected).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      await run;
      expect(rejected).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
