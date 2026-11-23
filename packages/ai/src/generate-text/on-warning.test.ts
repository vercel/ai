import {
  APICallError,
  type LanguageModelV2StreamPart,
  type LanguageModelV4Content,
  type LanguageModelV4FinishReason,
  type LanguageModelV4StreamPart,
  type LanguageModelV4Usage,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import { tool, type ModelMessage, type ToolSet } from '@ai-sdk/provider-utils';
import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { ToolLoopAgent } from '../agent/tool-loop-agent';
import { resetLogWarningsState } from '../logger/log-warnings';
import { MockLanguageModelV2 } from '../test/mock-language-model-v2';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { MockProviderV2 } from '../test/mock-provider-v2';
import { generateText } from './generate-text';
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

type Response = {
  content: Array<LanguageModelV4Content>;
  finishReason: LanguageModelV4FinishReason['unified'];
  warnings?: Array<SharedV4Warning>;
};

const text = (value: string, warnings: Array<SharedV4Warning> = []) =>
  ({
    content: [{ type: 'text', text: value }],
    finishReason: 'stop',
    warnings,
  }) satisfies Response;

const toolCall = {
  content: [
    {
      type: 'tool-call',
      toolCallId: 'call-1',
      toolName: 'weather',
      input: '{ "city": "Paris" }',
    },
  ],
  finishReason: 'tool-calls',
} satisfies Response;

function createModel(
  responses: ReadonlyArray<Response>,
  supportedUrls: Record<string, RegExp[]> = {},
) {
  let call = 0;
  return new MockLanguageModelV4({
    supportedUrls,
    doGenerate: async () => {
      const response = responses[call++];
      return {
        content: response.content,
        finishReason: { unified: response.finishReason, raw: undefined },
        usage,
        warnings: response.warnings ?? [],
      };
    },
    doStream: async () => {
      const response = responses[call++];
      return {
        stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([
          { type: 'stream-start', warnings: response.warnings ?? [] },
          ...response.content.flatMap(
            (part): Array<LanguageModelV4StreamPart> =>
              part.type === 'text'
                ? [
                    { type: 'text-start', id: '1' },
                    { type: 'text-delta', id: '1', delta: part.text },
                    { type: 'text-end', id: '1' },
                  ]
                : part.type === 'tool-call'
                  ? [part]
                  : [],
          ),
          {
            type: 'finish',
            finishReason: { unified: response.finishReason, raw: undefined },
            usage,
          },
        ]),
      };
    },
  });
}

function createV2Model() {
  const v2Usage = { inputTokens: 3, outputTokens: 10, totalTokens: 13 };
  return new MockLanguageModelV2({
    doGenerate: async () => ({
      content: [{ type: 'text', text: 'Hello' }],
      finishReason: 'stop',
      usage: v2Usage,
      warnings: [],
    }),
    doStream: async () => ({
      stream: convertArrayToReadableStream<LanguageModelV2StreamPart>([
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: '1' },
        { type: 'text-delta', id: '1', delta: 'Hello' },
        { type: 'text-end', id: '1' },
        { type: 'finish', finishReason: 'stop', usage: v2Usage },
      ]),
    }),
  });
}

const v2CompatibilityWarning = {
  type: 'compatibility',
  feature: 'specificationVersion',
  details:
    'Using v2 specification compatibility mode. Some features may not be available.',
} as const;

const weather = tool({
  inputSchema: z.object({ city: z.string() }),
  execute: async () => 'sunny',
});

const imagePartWarning = {
  type: 'deprecated',
  setting: '"image" content part',
  message: `The "image" content part type is deprecated. Use a "file" part with mediaType: 'image' (or a more specific image/* subtype) instead.`,
} as const;

const messagesWithImagePart: Array<ModelMessage> = [
  {
    role: 'user',
    content: [
      { type: 'text', text: 'What is in this image?' },
      {
        type: 'image',
        image: new Uint8Array([1, 2, 3]),
        mediaType: 'image/png',
      },
    ],
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe.each(['generate', 'stream'] as const)('onWarning (%s)', method => {
  async function run(settings: {
    responses: ReadonlyArray<Response>;
    tools?: ToolSet;
    messages?: Array<ModelMessage>;
    onWarning?: Parameters<typeof generateText>[0]['onWarning'];
  }) {
    const options = {
      model: createModel(settings.responses),
      tools: settings.tools,
      stopWhen: isStepCount(5),
      onWarning: settings.onWarning,
      ...(settings.messages != null
        ? { messages: settings.messages }
        : { prompt: 'What is the weather in Paris?' }),
    };

    if (method === 'generate') {
      const result = await generateText(options);
      return {
        stepWarnings: result.steps.map(step => step.warnings),
        resultWarnings: result.warnings,
        startStepWarnings: undefined,
      };
    }

    const result = streamText(options);
    const startStepWarnings: Array<unknown> = [];
    for await (const part of result.fullStream) {
      if (part.type === 'start-step') startStepWarnings.push(part.warnings);
    }
    return {
      stepWarnings: (await result.steps).map(step => step.warnings),
      resultWarnings: await result.warnings,
      startStepWarnings,
    };
  }

  it('sends provider warnings to onWarning instead of the global logger', async () => {
    const globalLogger = vi.fn();
    vi.stubGlobal('AI_SDK_LOG_WARNINGS', globalLogger);
    const onWarning = vi.fn();
    const warning = { type: 'other', message: 'Provider note' } as const;

    await run({ responses: [text('It is sunny.', [warning])], onWarning });

    expect(onWarning).toHaveBeenCalledWith({
      warnings: [warning],
      provider: 'mock-provider',
      model: 'mock-model-id',
    });
    expect(globalLogger).not.toHaveBeenCalled();
  });

  it('keeps using the global logger without onWarning', async () => {
    const globalLogger = vi.fn();
    vi.stubGlobal('AI_SDK_LOG_WARNINGS', globalLogger);
    const warning = { type: 'other', message: 'Provider note' } as const;

    await run({ responses: [text('It is sunny.', [warning])] });

    expect(globalLogger).toHaveBeenCalledWith({
      warnings: [warning],
      provider: 'mock-provider',
      model: 'mock-model-id',
    });
  });

  it('reports a prompt conversion deprecation in the warnings of each step', async () => {
    const globalLogger = vi.fn();
    vi.stubGlobal('AI_SDK_LOG_WARNINGS', globalLogger);
    const onWarning = vi.fn();

    const { stepWarnings, resultWarnings, startStepWarnings } = await run({
      responses: [toolCall, text('A red square.')],
      tools: { weather },
      messages: messagesWithImagePart,
      onWarning,
    });

    expect(stepWarnings).toEqual([[imagePartWarning], [imagePartWarning]]);
    expect(resultWarnings).toEqual([imagePartWarning, imagePartWarning]);
    if (method === 'stream') {
      expect(startStepWarnings).toEqual([
        [imagePartWarning],
        [imagePartWarning],
      ]);
    }
    expect(onWarning.mock.calls).toEqual([
      [{ warnings: [imagePartWarning] }],
      [{ warnings: [imagePartWarning] }],
    ]);
    expect(globalLogger).not.toHaveBeenCalled();
  });

  it('does not call onWarning for steps without warnings', async () => {
    const onWarning = vi.fn();

    await run({
      responses: [toolCall, text('It is sunny.')],
      tools: { weather },
      onWarning,
    });

    expect(onWarning).not.toHaveBeenCalled();
  });

  it('does not fail the call when onWarning throws', async () => {
    const warning = { type: 'other', message: 'Provider note' } as const;
    const onWarning = vi.fn(() => {
      throw new Error('onWarning failed');
    });

    const { stepWarnings } = await run({
      responses: [text('A red square.', [warning])],
      messages: messagesWithImagePart,
      onWarning,
    });

    expect(stepWarnings).toEqual([[imagePartWarning, warning]]);
    expect(onWarning).toHaveBeenCalledTimes(2);
  });

  it('does not cause an unhandled rejection when an async onWarning rejects', async () => {
    const onUnhandledRejection = vi.fn();
    process.on('unhandledRejection', onUnhandledRejection);

    try {
      await run({
        responses: [text('A red square.')],
        messages: messagesWithImagePart,
        onWarning: async () => {
          throw new Error('onWarning failed');
        },
      });
      await new Promise(resolve => setTimeout(resolve, 0));
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
    }

    expect(onUnhandledRejection).not.toHaveBeenCalled();
  });

  it('logs a prompt conversion deprecation without the provider scope', async () => {
    const globalLogger = vi.fn();
    vi.stubGlobal('AI_SDK_LOG_WARNINGS', globalLogger);
    const warning = { type: 'other', message: 'Provider note' } as const;

    await run({
      responses: [text('A red square.', [warning])],
      messages: messagesWithImagePart,
    });

    expect(globalLogger.mock.calls).toEqual([
      [{ warnings: [imagePartWarning] }],
      [
        {
          warnings: [warning],
          provider: 'mock-provider',
          model: 'mock-model-id',
        },
      ],
    ]);
  });

  it('keeps the stable deprecation code of the default logger', async () => {
    resetLogWarningsState();
    const emitWarning = vi
      .spyOn(process, 'emitWarning')
      .mockImplementation(() => {});

    await run({
      responses: [text('A red square.')],
      messages: messagesWithImagePart,
    });

    expect(emitWarning).toHaveBeenCalledWith(expect.any(String), {
      type: 'DeprecationWarning',
      code: 'AISDK_DEP_IMAGE_CONTENT_PART',
    });
  });

  it('sends the v2 compatibility warning to onWarning', async () => {
    const globalLogger = vi.fn();
    vi.stubGlobal('AI_SDK_LOG_WARNINGS', globalLogger);
    const onWarning = vi.fn();
    const options = { model: createV2Model(), prompt: 'Hello', onWarning };

    if (method === 'generate') {
      await generateText(options);
    } else {
      await streamText(options).consumeStream();
    }

    expect(onWarning.mock.calls).toEqual([
      [
        {
          warnings: [v2CompatibilityWarning],
          provider: 'mock-provider',
          model: 'mock-model-id',
        },
      ],
    ]);
    expect(globalLogger).not.toHaveBeenCalled();
  });

  it('sends the v2 compatibility warning of a model id from a v2 global provider to onWarning', async () => {
    const globalLogger = vi.fn();
    vi.stubGlobal('AI_SDK_LOG_WARNINGS', globalLogger);
    vi.stubGlobal(
      'AI_SDK_DEFAULT_PROVIDER',
      new MockProviderV2({ languageModels: { 'v2-model': createV2Model() } }),
    );
    const onWarning = vi.fn();
    const options = { model: 'v2-model', prompt: 'Hello', onWarning };

    if (method === 'generate') {
      await generateText(options);
    } else {
      await streamText(options).consumeStream();
    }

    expect(onWarning).toHaveBeenCalledWith({
      warnings: [v2CompatibilityWarning],
      provider: 'mock-provider',
      model: 'mock-model-id',
    });
    expect(globalLogger).not.toHaveBeenCalled();
  });

  it('sends the v2 compatibility warning of a prepareStep model to onWarning', async () => {
    const globalLogger = vi.fn();
    vi.stubGlobal('AI_SDK_LOG_WARNINGS', globalLogger);
    const onWarning = vi.fn();
    const stepModel = createV2Model();
    const options = {
      model: createModel([]),
      prompt: 'Hello',
      prepareStep: () => ({ model: stepModel }),
      onWarning,
    };

    if (method === 'generate') {
      await generateText(options);
    } else {
      await streamText(options).consumeStream();
    }

    expect(
      method === 'generate'
        ? stepModel.doGenerateCalls
        : stepModel.doStreamCalls,
    ).toHaveLength(1);
    expect(onWarning).toHaveBeenCalledWith({
      warnings: [v2CompatibilityWarning],
      provider: 'mock-provider',
      model: 'mock-model-id',
    });
    expect(globalLogger).not.toHaveBeenCalled();
  });

  it('keeps the file URLs of prompt warnings out of telemetry without recorded inputs', async () => {
    vi.stubGlobal('AI_SDK_LOG_WARNINGS', false);
    const onStepEnd = vi.fn();
    const signature = 'secret-signature';

    const options = {
      model: createModel([text('Done.')], { '*/*': [/.*/] }),
      messages: [
        { role: 'user', content: 'Read the report.' },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'report',
              input: {},
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call-1',
              toolName: 'report',
              output: {
                type: 'content',
                value: [
                  {
                    type: 'file-url',
                    url: `https://files.example.com/report?signature=${signature}`,
                  },
                ],
              },
            },
          ],
        },
      ] satisfies Array<ModelMessage>,
      telemetry: {
        recordInputs: false,
        recordOutputs: false,
        integrations: { onStepEnd },
      },
    };

    if (method === 'generate') {
      await generateText(options);
    } else {
      await streamText(options).consumeStream();
    }

    expect(onStepEnd).toHaveBeenCalledOnce();
    const event = onStepEnd.mock.calls[0][0];
    expect(event.warnings).toEqual([
      expect.objectContaining({
        setting: '"tool-result" content of type "file-url"',
      }),
    ]);
    expect(JSON.stringify(event)).not.toContain(signature);
  });
});

describe('onWarning', () => {
  it('receives the unsupported timeout warning of generateText', async () => {
    const globalLogger = vi.fn();
    vi.stubGlobal('AI_SDK_LOG_WARNINGS', globalLogger);
    const onWarning = vi.fn();

    await generateText({
      model: createModel([text('It is sunny.')]),
      prompt: 'What is the weather in Paris?',
      timeout: { chunkMs: 1000 },
      onWarning,
    });

    expect(onWarning).toHaveBeenCalledWith(
      expect.objectContaining({
        warnings: [expect.objectContaining({ feature: 'timeout.chunkMs' })],
      }),
    );
    expect(globalLogger).not.toHaveBeenCalled();
  });

  it('calls onStepStart of streamText when onWarning throws', async () => {
    const onStepStart = vi.fn();

    const result = streamText({
      model: createModel([text('A red square.')]),
      messages: messagesWithImagePart,
      onWarning: () => {
        throw new Error('onWarning failed');
      },
      onStepStart,
    });
    await result.consumeStream();

    expect(onStepStart).toHaveBeenCalledOnce();
  });

  it('receives a prompt conversion deprecation once when streamText retries the model call', async () => {
    const onWarning = vi.fn();
    const model = createModel([text('A red square.')]);
    vi.spyOn(model, 'doStream').mockRejectedValueOnce(
      new APICallError({
        message: 'Service Unavailable',
        url: 'https://api.example.com',
        requestBodyValues: {},
        statusCode: 503,
        responseHeaders: { 'retry-after-ms': '1' },
      }),
    );

    const result = streamText({
      model,
      messages: messagesWithImagePart,
      onWarning,
    });
    await result.consumeStream();

    expect(model.doStream).toHaveBeenCalledTimes(2);
    expect(onWarning.mock.calls).toEqual([[{ warnings: [imagePartWarning] }]]);
  });

  it.each(['generate', 'stream'] as const)(
    'receives the default step limit warning of a ToolLoopAgent (%s)',
    async method => {
      const globalLogger = vi.fn();
      vi.stubGlobal('AI_SDK_LOG_WARNINGS', globalLogger);
      const onWarning = vi.fn();

      const agent = new ToolLoopAgent({
        model: createModel(Array.from({ length: 21 }, () => toolCall)),
        tools: { weather },
        onWarning,
      });

      if (method === 'generate') {
        await agent.generate({ prompt: 'What is the weather in Paris?' });
      } else {
        const result = await agent.stream({
          prompt: 'What is the weather in Paris?',
        });
        await result.consumeStream();
      }

      expect(onWarning).toHaveBeenCalledOnce();
      expect(onWarning).toHaveBeenCalledWith({
        warnings: [
          expect.objectContaining({
            message: expect.stringContaining('isStepCount(20)'),
          }),
        ],
        provider: 'mock-provider',
        model: 'mock-model-id',
      });
      expect(globalLogger).not.toHaveBeenCalled();
    },
  );
});
