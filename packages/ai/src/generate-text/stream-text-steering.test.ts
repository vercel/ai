import type {
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import { tool } from '@ai-sdk/provider-utils';
import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { createSteering, type SteeringOutcome } from './steering';
import { isStepCount } from './stop-condition';
import { streamText } from './stream-text';

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

const toolCallStream: Array<LanguageModelV4StreamPart> = [
  { type: 'stream-start', warnings: [] },
  {
    type: 'tool-call',
    toolCallId: 'call-1',
    toolName: 'weather',
    input: '{ "city": "Paris" }',
  },
  {
    type: 'finish',
    finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
    usage,
  },
];

function createModel(responses: Array<() => Array<LanguageModelV4StreamPart>>) {
  let call = 0;
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream(responses[call++]()),
    }),
  });
}

function lastUserText(options: LanguageModelV4CallOptions) {
  const message = options.prompt.at(-1)!;
  return message.role === 'user' && message.content[0].type === 'text'
    ? message.content[0].text
    : undefined;
}

const weather = (execute: () => string | Promise<string>) =>
  tool({
    inputSchema: z.object({ city: z.string() }),
    execute: async () => execute(),
  });

describe('streamText experimental_steering', () => {
  it('should deliver a message sent during tool execution at the next step', async () => {
    const steering = createSteering();
    let outcome: Promise<SteeringOutcome> | undefined;

    const model = createModel([
      () => toolCallStream,
      () => textStream('It is sunny in Paris, Texas.'),
    ]);

    const result = streamText({
      model,
      prompt: 'What is the weather in Paris?',
      tools: {
        weather: weather(() => {
          outcome = steering.steer('I meant Paris, Texas.', { id: 'steer-1' });
          return 'sunny';
        }),
      },
      stopWhen: isStepCount(5),
      experimental_steering: steering,
    });

    expect(await result.text).toBe('It is sunny in Paris, Texas.');
    expect(await outcome).toMatchInlineSnapshot(`
      {
        "id": "steer-1",
        "message": {
          "content": "I meant Paris, Texas.",
          "role": "user",
        },
        "stepNumber": 1,
        "type": "delivered",
      }
    `);
    expect(model.doStreamCalls[1].prompt.slice(-2)).toMatchInlineSnapshot(`
      [
        {
          "content": [
            {
              "output": {
                "type": "text",
                "value": "sunny",
              },
              "providerOptions": undefined,
              "toolCallId": "call-1",
              "toolName": "weather",
              "type": "tool-result",
            },
          ],
          "providerOptions": undefined,
          "role": "tool",
        },
        {
          "content": [
            {
              "text": "I meant Paris, Texas.",
              "type": "text",
            },
          ],
          "providerOptions": undefined,
          "role": "user",
        },
      ]
    `);

    const steps = await result.steps;
    expect(steps[0].experimental_steeringMessages).toBeUndefined();
    expect(steps[1].experimental_steeringMessages).toMatchInlineSnapshot(`
      [
        {
          "content": "I meant Paris, Texas.",
          "role": "user",
        },
      ]
    `);
  });

  it('should continue for another step when a message arrives during the final answer', async () => {
    const steering = createSteering();
    let outcome: Promise<SteeringOutcome> | undefined;

    const model = createModel([
      () => {
        outcome = steering.steer('Also tell me about Tokyo.');
        return textStream('It is sunny in Paris. ');
      },
      () => textStream('Tokyo is rainy.'),
    ]);

    const result = streamText({
      model,
      prompt: 'What is the weather in Paris?',
      stopWhen: isStepCount(5),
      experimental_steering: steering,
    });

    expect(await result.text).toBe('Tokyo is rainy.');
    expect(model.doStreamCalls).toHaveLength(2);
    expect(lastUserText(model.doStreamCalls[1])).toBe(
      'Also tell me about Tokyo.',
    );
    expect(await outcome).toMatchObject({ type: 'delivered', stepNumber: 1 });
  });

  it('should deliver messages sent before the stream starts in the first step', async () => {
    const steering = createSteering();
    const outcome = steering.steer('Answer in French.');

    const model = createModel([() => textStream('Il fait beau.')]);

    const result = streamText({
      model,
      prompt: 'What is the weather in Paris?',
      experimental_steering: steering,
    });

    await result.consumeStream();

    expect(lastUserText(model.doStreamCalls[0])).toBe('Answer in French.');
    expect(await outcome).toMatchObject({ type: 'delivered', stepNumber: 0 });
  });

  it('should not deliver messages when the default stop condition ends the stream', async () => {
    const steering = createSteering();
    let outcome: Promise<SteeringOutcome> | undefined;

    const model = createModel([
      () => {
        outcome = steering.steer('Also tell me about Tokyo.', {
          id: 'steer-1',
        });
        return textStream('It is sunny in Paris.');
      },
    ]);

    const result = streamText({
      model,
      prompt: 'What is the weather in Paris?',
      experimental_steering: steering,
    });

    await result.consumeStream();

    expect(model.doStreamCalls).toHaveLength(1);
    expect(await outcome).toMatchInlineSnapshot(`
      {
        "id": "steer-1",
        "message": {
          "content": "Also tell me about Tokyo.",
          "role": "user",
        },
        "reason": "stop-condition",
        "type": "not-delivered",
      }
    `);
  });

  it('should not deliver messages while a tool approval is pending', async () => {
    const steering = createSteering();
    let outcome: Promise<SteeringOutcome> | undefined;

    const model = createModel([
      () => {
        outcome = steering.steer('Hurry up.');
        return toolCallStream;
      },
    ]);

    const result = streamText({
      model,
      prompt: 'What is the weather in Paris?',
      tools: { weather: weather(() => 'sunny') },
      toolApproval: { weather: 'user-approval' },
      stopWhen: isStepCount(5),
      experimental_steering: steering,
    });

    await result.consumeStream();

    expect(model.doStreamCalls).toHaveLength(1);
    expect(await outcome).toMatchObject({
      type: 'not-delivered',
      reason: 'waiting-for-tool-results',
    });
  });

  it('should not deliver messages when the stream is aborted', async () => {
    const steering = createSteering();
    const abortController = new AbortController();
    let outcome: Promise<SteeringOutcome> | undefined;

    const model = createModel([() => toolCallStream]);

    const result = streamText({
      model,
      prompt: 'What is the weather in Paris?',
      tools: {
        weather: weather(() => {
          outcome = steering.steer('I meant Paris, Texas.');
          abortController.abort();
          return 'sunny';
        }),
      },
      stopWhen: isStepCount(5),
      abortSignal: abortController.signal,
      experimental_steering: steering,
    });

    await result.consumeStream();

    expect(model.doStreamCalls).toHaveLength(1);
    expect(await outcome).toMatchObject({
      type: 'not-delivered',
      reason: 'aborted',
    });
  });

  it('should not deliver messages when the stream fails', async () => {
    const steering = createSteering();
    let outcome: Promise<SteeringOutcome> | undefined;

    const model = new MockLanguageModelV4({
      doStream: async () => {
        outcome = steering.steer('during the failure');
        return {
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({ type: 'stream-start', warnings: [] });
              controller.error(new Error('provider stream failure'));
            },
          }),
        };
      },
    });

    const result = streamText({
      model,
      prompt: 'hello',
      stopWhen: isStepCount(5),
      onError: () => {},
      experimental_steering: steering,
    });

    await result.consumeStream({ onError: () => {} });

    expect(await outcome).toMatchObject({
      type: 'not-delivered',
      reason: 'error',
    });
  });

  it('should not deliver messages sent after the stream finished', async () => {
    const steering = createSteering();

    const result = streamText({
      model: createModel([() => textStream('done')]),
      prompt: 'hello',
      experimental_steering: steering,
    });

    await result.consumeStream();

    expect(await steering.steer('too late')).toMatchObject({
      type: 'not-delivered',
      reason: 'finished',
    });
  });

  it('should keep steering messages out of response messages', async () => {
    const steering = createSteering();

    const model = createModel([
      () => {
        steering.steer('Also tell me about Tokyo.');
        return textStream('It is sunny in Paris.');
      },
      () => textStream('Tokyo is rainy.'),
    ]);

    const result = streamText({
      model,
      prompt: 'What is the weather in Paris?',
      stopWhen: isStepCount(5),
      experimental_steering: steering,
    });

    expect((await result.responseMessages).map(message => message.role))
      .toMatchInlineSnapshot(`
      [
        "assistant",
        "assistant",
      ]
    `);
  });

  it('should pass steering messages to prepareStep so rebuilt messages keep them in later steps', async () => {
    const steering = createSteering();
    const prepareStepSteeringMessages: Array<unknown> = [];
    let steered = false;

    const model = createModel([
      () => toolCallStream,
      () => toolCallStream,
      () => textStream('It is sunny in Paris, Texas.'),
    ]);

    const result = streamText({
      model,
      prompt: 'What is the weather in Paris?',
      tools: {
        weather: weather(() => {
          if (!steered) {
            steered = true;
            steering.steer('I meant Paris, Texas.');
          }
          return 'sunny';
        }),
      },
      stopWhen: isStepCount(5),
      experimental_steering: steering,
      prepareStep: ({
        initialMessages,
        steps,
        experimental_steeringMessages,
      }) => {
        prepareStepSteeringMessages.push(experimental_steeringMessages);
        return {
          messages: [
            ...initialMessages,
            ...steps.flatMap(step => [
              ...(step.experimental_steeringMessages ?? []),
              ...step.response.messages,
            ]),
            ...(experimental_steeringMessages ?? []),
          ],
        };
      },
    });

    await result.consumeStream();

    expect(prepareStepSteeringMessages).toMatchInlineSnapshot(`
      [
        undefined,
        [
          {
            "content": "I meant Paris, Texas.",
            "role": "user",
          },
        ],
        undefined,
      ]
    `);
    for (const call of [1, 2]) {
      expect(
        model.doStreamCalls[call].prompt.some(
          message =>
            message.role === 'user' &&
            message.content.some(
              part =>
                part.type === 'text' && part.text === 'I meant Paris, Texas.',
            ),
        ),
      ).toBe(true);
    }
  });

  it('should not continue for a steering message after a provider error', async () => {
    const steering = createSteering();
    let outcome: Promise<SteeringOutcome> | undefined;

    const model = createModel([
      () => {
        outcome = steering.steer('Also tell me about Tokyo.');
        return [
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: '1' },
          { type: 'text-delta', id: '1', delta: 'It is' },
          { type: 'error', error: new Error('provider failure') },
          {
            type: 'finish',
            finishReason: { unified: 'error', raw: 'error' },
            usage,
          },
        ];
      },
      () => textStream('Tokyo is rainy.'),
    ]);

    const result = streamText({
      model,
      prompt: 'What is the weather in Paris?',
      stopWhen: isStepCount(5),
      onError: () => {},
      experimental_steering: steering,
    });

    await result.consumeStream();

    expect(model.doStreamCalls).toHaveLength(1);
    expect(await result.finishReason).toBe('error');
    expect(await outcome).toMatchObject({
      type: 'not-delivered',
      reason: 'error',
    });
  });

  it('should not deliver messages when the arguments are invalid', async () => {
    const steering = createSteering();
    const outcome = steering.steer('hello');

    expect(() =>
      streamText({
        model: createModel([() => textStream('unused')]),
        prompt: 'hello',
        maxRetries: -1,
        experimental_steering: steering,
      }),
    ).toThrow();

    expect(await outcome).toMatchObject({
      type: 'not-delivered',
      reason: 'error',
    });
  });

  it('should not deliver messages when the prompt is invalid', async () => {
    const steering = createSteering();
    const outcome = steering.steer('hello');

    const result = streamText({
      model: createModel([() => textStream('unused')]),
      messages: [],
      onError: () => {},
      experimental_steering: steering,
    });

    await result.consumeStream({ onError: () => {} });

    expect(await outcome).toMatchObject({
      type: 'not-delivered',
      reason: 'error',
    });
  });

  it('should throw when the steering object is reused after a stream finished', async () => {
    const steering = createSteering();
    const model = createModel([() => textStream('first answer')]);

    await streamText({
      model,
      prompt: 'hello',
      experimental_steering: steering,
    }).consumeStream();

    expect(() =>
      streamText({ model, prompt: 'hello', experimental_steering: steering }),
    ).toThrow(
      'Create a new one with experimental_createSteering() for each call.',
    );
  });

  it('should not deliver messages that prepareStep removes', async () => {
    const steering = createSteering();
    let outcome: Promise<SteeringOutcome> | undefined;

    const model = createModel([
      () => toolCallStream,
      () => textStream('It is sunny in Paris.'),
    ]);

    const result = streamText({
      model,
      prompt: 'What is the weather in Paris?',
      tools: {
        weather: weather(() => {
          outcome = steering.steer('I meant Paris, Texas.');
          return 'sunny';
        }),
      },
      stopWhen: isStepCount(5),
      experimental_steering: steering,
      prepareStep: ({ initialMessages, responseMessages }) => ({
        messages: [...initialMessages, ...responseMessages],
      }),
    });

    const steps = await result.steps;

    expect(await outcome).toMatchObject({
      type: 'not-delivered',
      reason: 'removed-by-prepare-step',
    });
    expect(steps[1].experimental_steeringMessages).toBeUndefined();
  });

  it('should throw when the steering object is used by two streams at once', async () => {
    const steering = createSteering();
    const model = createModel([
      () => textStream('first'),
      () => textStream('second'),
    ]);

    const first = streamText({
      model,
      prompt: 'hello',
      experimental_steering: steering,
    });

    expect(() =>
      streamText({ model, prompt: 'hello', experimental_steering: steering }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[AI_InvalidArgumentError: Invalid argument for parameter experimental_steering: The steering object was already used by a generation. Create a new one with experimental_createSteering() for each call.]`,
    );

    await first.consumeStream();
  });
});
