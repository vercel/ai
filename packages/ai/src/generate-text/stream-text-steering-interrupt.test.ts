import type {
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { describe, expect, it, vi } from 'vitest';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { readUIMessageStream } from '../ui-message-stream/read-ui-message-stream';
import { createSteering, type SteeringOutcome } from './steering';
import { isStepCount } from './stop-condition';
import { streamText } from './stream-text';

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

const textStream = (text: string): Array<LanguageModelV4StreamPart> => [
  { type: 'stream-start', warnings: [] },
  { type: 'text-start', id: '2' },
  { type: 'text-delta', id: '2', delta: text },
  { type: 'text-end', id: '2' },
  {
    type: 'finish',
    finishReason: { unified: 'stop', raw: 'stop' },
    usage: usage(10),
  },
];

function lastUserText(options: LanguageModelV4CallOptions) {
  const message = options.prompt.at(-1)!;
  return message.role === 'user' && message.content[0].type === 'text'
    ? message.content[0].text
    : undefined;
}

function hangingStream({
  options,
  parts,
  release,
}: {
  options: LanguageModelV4CallOptions;
  parts: Array<LanguageModelV4StreamPart>;
  release?: Promise<Array<LanguageModelV4StreamPart>>;
}) {
  return new ReadableStream<LanguageModelV4StreamPart>({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(part);
      }
      const signal = options.abortSignal;
      signal?.addEventListener(
        'abort',
        () => {
          try {
            controller.error(signal.reason);
          } catch {}
        },
        { once: true },
      );
      void release?.then(rest => {
        for (const part of rest) {
          controller.enqueue(part);
        }
        controller.close();
      });
    },
  });
}

function createModel({
  first,
  onFirstCall,
  rest,
}: {
  first: (
    options: LanguageModelV4CallOptions,
  ) => ReadableStream<LanguageModelV4StreamPart>;
  onFirstCall?: (options: LanguageModelV4CallOptions) => void;
  rest: Array<() => Array<LanguageModelV4StreamPart>>;
}) {
  const calls: LanguageModelV4CallOptions[] = [];
  const model = new MockLanguageModelV4({
    doStream: async options => {
      calls.push(options);
      if (calls.length === 1) {
        const stream = first(options);
        onFirstCall?.(options);
        return { stream };
      }
      return {
        stream: convertArrayToReadableStream(rest[calls.length - 2]()),
      };
    },
  });
  return { model, calls };
}

async function collect<T>(stream: AsyncIterable<T>) {
  const parts: T[] = [];
  for await (const part of stream) {
    parts.push(part);
  }
  return parts;
}

describe('streamText experimental_steering interrupt', () => {
  it('should cancel a model stream without output and redo it in the same step with the message', async () => {
    const steering = createSteering();
    let outcome: Promise<SteeringOutcome> | undefined;

    const { model, calls } = createModel({
      first: options =>
        hangingStream({
          options,
          parts: [{ type: 'stream-start', warnings: [] }],
        }),
      onFirstCall: () => {
        outcome = steering.steer('Use Paris, Texas instead.', {
          interrupt: true,
        });
      },
      rest: [() => textStream('It is sunny in Paris, Texas.')],
    });

    const result = streamText({
      model,
      prompt: 'What is the weather in Paris?',
      experimental_steering: steering,
    });

    const parts = await collect(result.fullStream);

    expect(calls).toHaveLength(2);
    expect(calls[0].abortSignal?.aborted).toBe(true);
    expect(lastUserText(calls[1])).toBe('Use Paris, Texas instead.');
    expect(parts.filter(part => part.type === 'start-step')).toHaveLength(1);
    expect(parts.filter(part => part.type === 'finish-step')).toHaveLength(1);
    expect(parts.filter(part => part.type === 'error')).toHaveLength(0);
    expect(
      parts.filter(part => part.type === 'steering-message'),
    ).toMatchObject([
      {
        message: { role: 'user', content: 'Use Paris, Texas instead.' },
        stepNumber: 0,
      },
    ]);
    expect(await result.text).toBe('It is sunny in Paris, Texas.');
    expect(await result.steps).toHaveLength(1);
    expect(await outcome).toMatchObject({ type: 'delivered', stepNumber: 0 });
  });

  it('should close text parts the ui saw before the interrupt', async () => {
    const steering = createSteering();

    const { model } = createModel({
      first: options =>
        hangingStream({
          options,
          parts: [
            { type: 'stream-start', warnings: [] },
            { type: 'text-start', id: '1' },
          ],
        }),
      onFirstCall: () => {
        void steering.steer('Use Paris, Texas instead.', { interrupt: true });
      },
      rest: [() => textStream('It is sunny in Paris, Texas.')],
    });

    const result = streamText({
      model,
      prompt: 'What is the weather in Paris?',
      experimental_steering: steering,
    });

    const parts = await collect(result.fullStream);
    const starts = parts.filter(part => part.type === 'text-start').length;
    const ends = parts.filter(part => part.type === 'text-end').length;
    expect(starts).toBe(ends);
    expect(parts.filter(part => part.type === 'start-step')).toHaveLength(1);
    expect(parts.filter(part => part.type === 'finish-step')).toHaveLength(1);

    const messages = await collect(
      readUIMessageStream({ stream: result.toUIMessageStream() }),
    );
    expect(messages.at(-1)?.parts.some(part => part.type === 'text')).toBe(
      true,
    );
  });

  it('should send one start-step when the interrupt arrives after the ui saw the step start', async () => {
    const steering = createSteering();
    let outcome: Promise<SteeringOutcome> | undefined;

    const { model, calls } = createModel({
      first: options =>
        hangingStream({
          options,
          parts: [
            { type: 'stream-start', warnings: [] },
            { type: 'text-start', id: '1' },
          ],
        }),
      rest: [() => textStream('It is sunny in Paris, Texas.')],
    });

    const result = streamText({
      model,
      prompt: 'What is the weather in Paris?',
      experimental_steering: steering,
    });

    const parts: Array<{ type: string }> = [];
    for await (const part of result.fullStream) {
      parts.push(part);
      if (part.type === 'text-start' && outcome == null) {
        outcome = steering.steer('Use Paris, Texas instead.', {
          interrupt: true,
        });
      }
    }

    expect(calls).toHaveLength(2);
    expect(parts.map(part => part.type)).toEqual([
      'start',
      'start-step',
      'text-start',
      'text-end',
      'steering-message',
      'text-start',
      'text-delta',
      'text-end',
      'finish-step',
      'finish',
    ]);
    expect(await outcome).toMatchObject({ type: 'delivered', stepNumber: 0 });
  });

  it('should use the request and warnings of the redo when the cancelled call already sent start-step', async () => {
    const steering = createSteering();
    let outcome: Promise<SteeringOutcome> | undefined;
    let calls = 0;

    const model = new MockLanguageModelV4({
      doStream: async options => {
        calls++;
        if (calls === 1) {
          return {
            request: { body: 'cancelled request' },
            stream: hangingStream({
              options,
              parts: [
                {
                  type: 'stream-start',
                  warnings: [{ type: 'other', message: 'cancelled call' }],
                },
                { type: 'text-start', id: '1' },
              ],
            }),
          };
        }
        return {
          request: { body: 'redo request' },
          stream: convertArrayToReadableStream([
            {
              type: 'stream-start',
              warnings: [{ type: 'other', message: 'redo call' }],
            },
            ...textStream('It is sunny in Paris, Texas.').slice(1),
          ]),
        };
      },
    });

    const result = streamText({
      model,
      prompt: 'What is the weather in Paris?',
      include: { requestBody: true },
      experimental_steering: steering,
    });

    for await (const part of result.fullStream) {
      if (part.type === 'text-start' && outcome == null) {
        outcome = steering.steer('Use Paris, Texas instead.', {
          interrupt: true,
        });
      }
    }

    const [step] = await result.steps;
    expect(calls).toBe(2);
    expect(step.request.body).toBe('redo request');
    expect(step.warnings).toEqual([{ type: 'other', message: 'redo call' }]);
    expect(step.content).toMatchInlineSnapshot(`
      [
        {
          "providerMetadata": undefined,
          "text": "It is sunny in Paris, Texas.",
          "type": "text",
        },
      ]
    `);
    expect(await outcome).toMatchObject({ type: 'delivered', stepNumber: 0 });
  });

  it('should redo the step when the interrupt arrives while a stream retry waits for the provider', async () => {
    const steering = createSteering();
    let outcome: Promise<SteeringOutcome> | undefined;
    const calls: LanguageModelV4CallOptions[] = [];

    const model = new MockLanguageModelV4({
      doStream: async options => {
        calls.push(options);
        if (calls.length === 1) {
          return {
            stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([
              { type: 'stream-start', warnings: [] },
              {
                type: 'error',
                error: {
                  message: 'overloaded',
                  statusCode: 503,
                  isRetryable: true,
                },
              },
            ]),
          };
        }
        if (calls.length === 2) {
          const signal = options.abortSignal!;
          outcome = steering.steer('Use Paris, Texas instead.', {
            interrupt: true,
          });
          return new Promise((_, reject) => {
            if (signal.aborted) {
              reject(signal.reason);
            }
            signal.addEventListener('abort', () => reject(signal.reason), {
              once: true,
            });
          });
        }
        return {
          stream: convertArrayToReadableStream(
            textStream('It is sunny in Paris, Texas.'),
          ),
        };
      },
    });

    const result = streamText({
      model,
      prompt: 'What is the weather in Paris?',
      streamRetries: 1,
      experimental_steering: steering,
      onError: () => {},
    });

    const parts = await collect(result.fullStream);

    expect(calls).toHaveLength(3);
    expect(lastUserText(calls[2])).toBe('Use Paris, Texas instead.');
    expect(parts.some(part => part.type === 'error')).toBe(false);
    expect(await result.text).toBe('It is sunny in Paris, Texas.');
    expect(await outcome).toMatchObject({ type: 'delivered', stepNumber: 0 });
  });

  it('should keep steering messages that the step already delivered in the redo', async () => {
    const steering = createSteering();
    const earlier = steering.steer('Answer in Celsius.');
    let interrupt: Promise<SteeringOutcome> | undefined;

    const { model, calls } = createModel({
      first: options =>
        hangingStream({
          options,
          parts: [{ type: 'stream-start', warnings: [] }],
        }),
      onFirstCall: () => {
        interrupt = steering.steer('Use Paris, Texas instead.', {
          interrupt: true,
        });
      },
      rest: [() => textStream('It is 22 degrees in Paris, Texas.')],
    });

    const result = streamText({
      model,
      prompt: 'What is the weather in Paris?',
      experimental_steering: steering,
    });

    await result.consumeStream();

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
    expect((await result.steps)[0].experimental_steeringMessages).toEqual([
      { role: 'user', content: 'Answer in Celsius.' },
      { role: 'user', content: 'Use Paris, Texas instead.' },
    ]);
    expect(await earlier).toMatchObject({ type: 'delivered', stepNumber: 0 });
    expect(await interrupt).toMatchObject({ type: 'delivered', stepNumber: 0 });
  });

  it('should leave the cancelled stream out of usage', async () => {
    const steering = createSteering();

    const { model } = createModel({
      first: options =>
        hangingStream({
          options,
          parts: [{ type: 'stream-start', warnings: [] }],
        }),
      onFirstCall: () => {
        void steering.steer('Use Paris, Texas instead.', { interrupt: true });
      },
      rest: [() => textStream('It is sunny in Paris, Texas.')],
    });

    const result = streamText({
      model,
      prompt: 'What is the weather in Paris?',
      experimental_steering: steering,
    });

    await result.consumeStream();
    expect((await result.totalUsage).outputTokens).toBe(10);
  });

  it('should run prepareStep again for the redo and notify onStepStart once', async () => {
    const steering = createSteering();
    const prepareStep = vi.fn(() => undefined);
    const onStepStart = vi.fn();

    const { model } = createModel({
      first: options =>
        hangingStream({
          options,
          parts: [{ type: 'stream-start', warnings: [] }],
        }),
      onFirstCall: () => {
        void steering.steer('Use Paris, Texas instead.', { interrupt: true });
      },
      rest: [() => textStream('It is sunny in Paris, Texas.')],
    });

    const result = streamText({
      model,
      prompt: 'What is the weather in Paris?',
      experimental_steering: steering,
      prepareStep,
      onStepStart,
    });

    await result.consumeStream();

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
  });

  it('should fall back to the next step when output already started', async () => {
    const steering = createSteering();
    let outcome: Promise<SteeringOutcome> | undefined;
    let release!: (parts: Array<LanguageModelV4StreamPart>) => void;

    const { model, calls } = createModel({
      first: options =>
        hangingStream({
          options,
          parts: [
            { type: 'stream-start', warnings: [] },
            { type: 'text-start', id: '1' },
            { type: 'text-delta', id: '1', delta: 'It is ' },
          ],
          release: new Promise(resolve => {
            release = resolve;
          }),
        }),
      rest: [() => textStream('It is sunny in Paris, Texas.')],
    });

    const result = streamText({
      model,
      prompt: 'What is the weather in Paris?',
      stopWhen: isStepCount(3),
      experimental_steering: steering,
      onChunk: ({ chunk }) => {
        if (chunk.type === 'text-delta' && outcome == null) {
          outcome = steering.steer('Use Paris, Texas instead.', {
            interrupt: true,
          });
          release([
            { type: 'text-delta', id: '1', delta: 'sunny in Paris.' },
            { type: 'text-end', id: '1' },
            {
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage: usage(10),
            },
          ]);
        }
      },
    });

    await result.consumeStream();

    expect(calls[0].abortSignal?.aborted ?? false).toBe(false);
    expect(await result.steps).toHaveLength(2);
    expect(await outcome).toMatchObject({ type: 'delivered', stepNumber: 1 });
  });

  it('should fall back to the next step after a tool input started', async () => {
    const steering = createSteering();
    let outcome: Promise<SteeringOutcome> | undefined;
    let release!: (parts: Array<LanguageModelV4StreamPart>) => void;

    const { model, calls } = createModel({
      first: options =>
        hangingStream({
          options,
          parts: [
            { type: 'stream-start', warnings: [] },
            { type: 'tool-input-start', id: 'call-1', toolName: 'weather' },
          ],
          release: new Promise(resolve => {
            release = resolve;
          }),
        }),
      rest: [() => textStream('It is sunny in Paris, Texas.')],
    });

    const result = streamText({
      model,
      prompt: 'What is the weather in Paris?',
      stopWhen: isStepCount(3),
      experimental_steering: steering,
      onChunk: ({ chunk }) => {
        if (chunk.type === 'tool-input-start' && outcome == null) {
          outcome = steering.steer('Use Paris, Texas instead.', {
            interrupt: true,
          });
          release([
            { type: 'tool-input-end', id: 'call-1' },
            {
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage: usage(10),
            },
          ]);
        }
      },
    });

    await result.consumeStream();

    expect(calls[0].abortSignal?.aborted ?? false).toBe(false);
    expect(await outcome).toMatchObject({ type: 'delivered', stepNumber: 1 });
  });

  it('should treat a caller abort as an abort and not as an interrupt', async () => {
    const steering = createSteering();
    const controller = new AbortController();
    let outcome: Promise<SteeringOutcome> | undefined;

    const { model, calls } = createModel({
      first: options =>
        hangingStream({
          options,
          parts: [{ type: 'stream-start', warnings: [] }],
        }),
      onFirstCall: () => {
        outcome = steering.steer('Use Paris, Texas instead.', {
          interrupt: true,
        });
        controller.abort(new Error('stopped by user'));
      },
      rest: [() => textStream('It is sunny in Paris, Texas.')],
    });

    const result = streamText({
      model,
      prompt: 'What is the weather in Paris?',
      abortSignal: controller.signal,
      experimental_steering: steering,
    });

    await result.consumeStream();

    expect(calls).toHaveLength(1);
    expect(await outcome).toMatchObject({
      type: 'not-delivered',
      reason: 'aborted',
    });
  });

  it('should not cancel the model stream for a steer without interrupt', async () => {
    const steering = createSteering();
    let outcome: Promise<SteeringOutcome> | undefined;
    let release!: (parts: Array<LanguageModelV4StreamPart>) => void;

    const { model, calls } = createModel({
      first: options =>
        hangingStream({
          options,
          parts: [{ type: 'stream-start', warnings: [] }],
          release: new Promise(resolve => {
            release = resolve;
          }),
        }),
      onFirstCall: () => {
        outcome = steering.steer('Use Paris, Texas instead.');
        setTimeout(
          () =>
            release([
              { type: 'text-start', id: '1' },
              { type: 'text-delta', id: '1', delta: 'Sunny.' },
              { type: 'text-end', id: '1' },
              {
                type: 'finish',
                finishReason: { unified: 'stop', raw: 'stop' },
                usage: usage(10),
              },
            ]),
          5,
        );
      },
      rest: [() => textStream('It is sunny in Paris, Texas.')],
    });

    const result = streamText({
      model,
      prompt: 'What is the weather in Paris?',
      stopWhen: isStepCount(3),
      experimental_steering: steering,
    });

    await result.consumeStream();

    expect(calls[0].abortSignal?.aborted ?? false).toBe(false);
    expect(await result.steps).toHaveLength(2);
    expect(await outcome).toMatchObject({ type: 'delivered', stepNumber: 1 });
  });

  it('should keep the step timeout running across the redo', async () => {
    const steering = createSteering();
    const start = Date.now();
    let abortedAfterMs: number | undefined;

    const model = new MockLanguageModelV4({
      doStream: async options => {
        options.abortSignal?.addEventListener('abort', () => {
          abortedAfterMs ??= 0;
        });
        return {
          stream: hangingStream({
            options,
            parts: [{ type: 'stream-start', warnings: [] }],
          }),
        };
      },
    });
    let calls = 0;

    const result = streamText({
      model,
      prompt: 'What is the weather in Paris?',
      timeout: { stepMs: 200 },
      experimental_steering: steering,
      onLanguageModelCallStart: () => {
        calls++;
        if (calls === 1) {
          setTimeout(() => {
            void steering.steer('Use Paris, Texas instead.', {
              interrupt: true,
            });
          }, 120);
        }
      },
    });

    await result.consumeStream();
    const elapsedMs = Date.now() - start;

    expect(calls).toBe(2);
    expect(elapsedMs).toBeLessThan(290);
  });
});
