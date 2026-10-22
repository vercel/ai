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

const usage: LanguageModelV4Usage = {
  inputTokens: {
    total: 3,
    noCache: 3,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 10, text: 10, reasoning: undefined },
};

const textResponse = (text: string): LanguageModelV4GenerateResult => ({
  content: [{ type: 'text', text }],
  finishReason: { unified: 'stop', raw: 'stop' },
  usage,
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
  usage,
  warnings: [],
};

function createModel(
  responses: Array<
    (options: LanguageModelV4CallOptions) => LanguageModelV4GenerateResult
  >,
) {
  let call = 0;
  return new MockLanguageModelV4({
    doGenerate: async options => responses[call++](options),
  });
}

function lastUserText(options: LanguageModelV4CallOptions) {
  const message = options.prompt.at(-1)!;
  return message.role === 'user' && message.content[0].type === 'text'
    ? message.content[0].text
    : undefined;
}

describe('generateText experimental_steering', () => {
  it('should deliver a message sent during tool execution at the next step', async () => {
    const steering = createSteering();
    let outcome: Promise<SteeringOutcome> | undefined;

    const model = createModel([
      () => toolCallResponse,
      () => textResponse('It is sunny in Paris, Texas.'),
    ]);

    const result = await generateText({
      model,
      prompt: 'What is the weather in Paris?',
      tools: {
        weather: tool({
          inputSchema: z.object({ city: z.string() }),
          execute: async ({ city }) => {
            outcome = steering.steer('I meant Paris, Texas.', {
              id: 'steer-1',
            });
            return `sunny in ${city}`;
          },
        }),
      },
      stopWhen: isStepCount(5),
      experimental_steering: steering,
    });

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
    expect(model.doGenerateCalls[1].prompt.slice(1)).toMatchInlineSnapshot(`
      [
        {
          "content": [
            {
              "input": {
                "city": "Paris",
              },
              "providerExecuted": undefined,
              "providerOptions": undefined,
              "toolCallId": "call-1",
              "toolName": "weather",
              "type": "tool-call",
            },
          ],
          "providerOptions": undefined,
          "role": "assistant",
        },
        {
          "content": [
            {
              "output": {
                "type": "text",
                "value": "sunny in Paris",
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
    expect(result.steps[0].experimental_steeringMessages).toBeUndefined();
    expect(result.steps[1].experimental_steeringMessages)
      .toMatchInlineSnapshot(`
      [
        {
          "content": "I meant Paris, Texas.",
          "role": "user",
        },
      ]
    `);
    expect(result.text).toBe('It is sunny in Paris, Texas.');
  });

  it('should continue for another step when a message arrives during the final answer', async () => {
    const steering = createSteering();
    let outcome: Promise<SteeringOutcome> | undefined;

    const model = createModel([
      () => {
        outcome = steering.steer('Also tell me about Tokyo.');
        return textResponse('It is sunny in Paris.');
      },
      () => textResponse('Tokyo is rainy.'),
    ]);

    const result = await generateText({
      model,
      prompt: 'What is the weather in Paris?',
      stopWhen: isStepCount(5),
      experimental_steering: steering,
    });

    expect(model.doGenerateCalls).toHaveLength(2);
    expect(lastUserText(model.doGenerateCalls[1])).toBe(
      'Also tell me about Tokyo.',
    );
    expect(await outcome).toMatchObject({ type: 'delivered', stepNumber: 1 });
    expect(result.text).toBe('Tokyo is rainy.');
  });

  it('should deliver messages sent before the run in the first step', async () => {
    const steering = createSteering();
    const outcome = steering.steer('Answer in French.');

    const model = createModel([() => textResponse('Il fait beau.')]);

    const result = await generateText({
      model,
      prompt: 'What is the weather in Paris?',
      experimental_steering: steering,
    });

    expect(model.doGenerateCalls).toHaveLength(1);
    expect(lastUserText(model.doGenerateCalls[0])).toBe('Answer in French.');
    expect(await outcome).toMatchObject({ type: 'delivered', stepNumber: 0 });
    expect(result.steps[0].experimental_steeringMessages).toHaveLength(1);
  });

  it('should add each message as its own user message in order', async () => {
    const steering = createSteering();

    const model = createModel([
      () => {
        steering.steer('first');
        steering.steer('second');
        return textResponse('done');
      },
      () => textResponse('done again'),
    ]);

    await generateText({
      model,
      prompt: 'hello',
      stopWhen: isStepCount(5),
      experimental_steering: steering,
    });

    expect(model.doGenerateCalls[1].prompt.slice(-2)).toMatchInlineSnapshot(`
      [
        {
          "content": [
            {
              "text": "first",
              "type": "text",
            },
          ],
          "providerOptions": undefined,
          "role": "user",
        },
        {
          "content": [
            {
              "text": "second",
              "type": "text",
            },
          ],
          "providerOptions": undefined,
          "role": "user",
        },
      ]
    `);
  });

  it('should not deliver messages when the default stop condition ends the run', async () => {
    const steering = createSteering();
    let outcome: Promise<SteeringOutcome> | undefined;

    const model = createModel([
      () => {
        outcome = steering.steer('Also tell me about Tokyo.', {
          id: 'steer-1',
        });
        return textResponse('It is sunny in Paris.');
      },
    ]);

    await generateText({
      model,
      prompt: 'What is the weather in Paris?',
      experimental_steering: steering,
    });

    expect(model.doGenerateCalls).toHaveLength(1);
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

  it('should not deliver messages when a stop condition ends a tool loop', async () => {
    const steering = createSteering();
    let outcome: Promise<SteeringOutcome> | undefined;

    const model = createModel([() => toolCallResponse]);

    await generateText({
      model,
      prompt: 'What is the weather in Paris?',
      tools: {
        weather: tool({
          inputSchema: z.object({ city: z.string() }),
          execute: async () => {
            outcome = steering.steer('I meant Paris, Texas.');
            return 'sunny';
          },
        }),
      },
      stopWhen: isStepCount(1),
      experimental_steering: steering,
    });

    expect(model.doGenerateCalls).toHaveLength(1);
    expect(await outcome).toMatchObject({
      type: 'not-delivered',
      reason: 'stop-condition',
    });
  });

  it('should not deliver messages while a tool approval is pending', async () => {
    const steering = createSteering();
    let outcome: Promise<SteeringOutcome> | undefined;

    const model = createModel([
      () => {
        outcome = steering.steer('Hurry up.');
        return toolCallResponse;
      },
    ]);

    const result = await generateText({
      model,
      prompt: 'What is the weather in Paris?',
      tools: {
        weather: tool({
          inputSchema: z.object({ city: z.string() }),
          execute: async () => 'sunny',
        }),
      },
      toolApproval: { weather: 'user-approval' },
      stopWhen: isStepCount(5),
      experimental_steering: steering,
    });

    expect(model.doGenerateCalls).toHaveLength(1);
    expect(result.steps.at(-1)!.content.at(-1)?.type).toBe(
      'tool-approval-request',
    );
    expect(await outcome).toMatchObject({
      type: 'not-delivered',
      reason: 'waiting-for-tool-results',
    });
  });

  it('should not deliver messages when the run is aborted', async () => {
    const steering = createSteering();
    const abortController = new AbortController();
    let outcome: Promise<SteeringOutcome> | undefined;

    const model = createModel([() => toolCallResponse]);

    await expect(
      generateText({
        model,
        prompt: 'What is the weather in Paris?',
        tools: {
          weather: tool({
            inputSchema: z.object({ city: z.string() }),
            execute: async () => {
              outcome = steering.steer('I meant Paris, Texas.');
              abortController.abort();
              return 'sunny';
            },
          }),
        },
        stopWhen: isStepCount(5),
        abortSignal: abortController.signal,
        experimental_steering: steering,
      }),
    ).rejects.toThrow();

    expect(model.doGenerateCalls).toHaveLength(1);
    expect(await outcome).toMatchObject({
      type: 'not-delivered',
      reason: 'aborted',
    });
  });

  it('should not deliver messages when the run fails', async () => {
    const steering = createSteering();
    const outcome = steering.steer('hello');

    await expect(
      generateText({
        model: new MockLanguageModelV4({
          doGenerate: async () => {
            throw new Error('provider failure');
          },
        }),
        prompt: 'What is the weather in Paris?',
        maxRetries: 0,
        experimental_steering: steering,
      }),
    ).rejects.toThrow('provider failure');

    expect(await outcome).toMatchObject({
      type: 'delivered',
      stepNumber: 0,
    });
    expect(await steering.steer('after the failure')).toMatchObject({
      type: 'not-delivered',
      reason: 'finished',
    });
  });

  it('should not deliver messages sent after the run finished', async () => {
    const steering = createSteering();

    await generateText({
      model: createModel([() => textResponse('done')]),
      prompt: 'hello',
      experimental_steering: steering,
    });

    expect(await steering.steer('too late')).toMatchObject({
      type: 'not-delivered',
      reason: 'finished',
    });
  });

  it('should pass steering messages to prepareStep and keep them out of response messages', async () => {
    const steering = createSteering();
    const prepareStepMessages: Array<unknown> = [];

    const model = createModel([
      () => {
        steering.steer('Also tell me about Tokyo.');
        return textResponse('It is sunny in Paris.');
      },
      () => textResponse('Tokyo is rainy.'),
    ]);

    const result = await generateText({
      model,
      prompt: 'What is the weather in Paris?',
      stopWhen: isStepCount(5),
      experimental_steering: steering,
      prepareStep: ({ messages }) => {
        prepareStepMessages.push(messages.at(-1));
        return undefined;
      },
    });

    expect(prepareStepMessages[1]).toMatchInlineSnapshot(`
      {
        "content": "Also tell me about Tokyo.",
        "role": "user",
      }
    `);
    expect(result.responseMessages.map(message => message.role))
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
      () => toolCallResponse,
      () => toolCallResponse,
      () => textResponse('It is sunny in Paris, Texas.'),
    ]);

    await generateText({
      model,
      prompt: 'What is the weather in Paris?',
      tools: {
        weather: tool({
          inputSchema: z.object({ city: z.string() }),
          execute: async () => {
            if (!steered) {
              steered = true;
              steering.steer('I meant Paris, Texas.');
            }
            return 'sunny';
          },
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
        model.doGenerateCalls[call].prompt.some(
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

  it('should not continue for a steering message after a step that finished with an error', async () => {
    const steering = createSteering();
    let outcome: Promise<SteeringOutcome> | undefined;

    const model = createModel([
      () => {
        outcome = steering.steer('Also tell me about Tokyo.');
        return {
          ...textResponse('It is'),
          finishReason: { unified: 'error', raw: 'error' },
        };
      },
      () => textResponse('Tokyo is rainy.'),
    ]);

    const result = await generateText({
      model,
      prompt: 'What is the weather in Paris?',
      stopWhen: isStepCount(5),
      experimental_steering: steering,
    });

    expect(model.doGenerateCalls).toHaveLength(1);
    expect(result.finishReason).toBe('error');
    expect(await outcome).toMatchObject({
      type: 'not-delivered',
      reason: 'error',
    });
  });

  it('should not deliver messages when the prompt is invalid', async () => {
    const steering = createSteering();
    const outcome = steering.steer('hello');

    await expect(
      generateText({
        model: createModel([() => textResponse('unused')]),
        messages: [],
        experimental_steering: steering,
      }),
    ).rejects.toThrow();

    expect(await outcome).toMatchObject({
      type: 'not-delivered',
      reason: 'error',
    });
    expect(await steering.steer('after the failure')).toMatchObject({
      type: 'not-delivered',
      reason: 'finished',
    });
  });

  it('should not deliver messages that prepareStep removes', async () => {
    const steering = createSteering();
    let outcome: Promise<SteeringOutcome> | undefined;

    const model = createModel([
      () => toolCallResponse,
      () => textResponse('It is sunny in Paris.'),
    ]);

    const result = await generateText({
      model,
      prompt: 'What is the weather in Paris?',
      tools: {
        weather: tool({
          inputSchema: z.object({ city: z.string() }),
          execute: async () => {
            outcome = steering.steer('I meant Paris, Texas.');
            return 'sunny';
          },
        }),
      },
      stopWhen: isStepCount(5),
      experimental_steering: steering,
      prepareStep: ({ initialMessages, responseMessages }) => ({
        messages: [...initialMessages, ...responseMessages],
      }),
    });

    expect(await outcome).toMatchObject({
      type: 'not-delivered',
      reason: 'removed-by-prepare-step',
    });
    expect(result.steps[1].experimental_steeringMessages).toBeUndefined();
    expect(lastUserText(model.doGenerateCalls[1])).toBeUndefined();
  });

  it('should throw when the steering object is used by two runs at once', async () => {
    const steering = createSteering();
    const model = createModel([
      () => textResponse('first'),
      () => textResponse('second'),
    ]);

    const first = generateText({
      model,
      prompt: 'hello',
      experimental_steering: steering,
    });

    await expect(
      generateText({ model, prompt: 'hello', experimental_steering: steering }),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `[AI_InvalidArgumentError: Invalid argument for parameter experimental_steering: The steering object was already used by a generation. Create a new one with experimental_createSteering() for each call.]`,
    );

    await first;
  });
});
