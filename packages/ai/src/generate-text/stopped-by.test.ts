import type {
  LanguageModelV4Content,
  LanguageModelV4FinishReason,
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import { tool, type ToolSet } from '@ai-sdk/provider-utils';
import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { ToolLoopAgent } from '../agent/tool-loop-agent';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { generateText } from './generate-text';
import { isStepCount, type StopCondition } from './stop-condition';
import { streamText } from './stream-text';
import type { TextStreamPart } from './stream-text-result';

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
};

const text = (
  value: string,
  finishReason: Response['finishReason'] = 'stop',
): Response => ({ content: [{ type: 'text', text: value }], finishReason });

const toolCall = (
  finishReason: Response['finishReason'] = 'tool-calls',
): Response => ({
  content: [
    {
      type: 'tool-call',
      toolCallId: 'call-1',
      toolName: 'weather',
      input: '{ "city": "Paris" }',
    },
  ],
  finishReason,
});

function toStream(response: Response): Array<LanguageModelV4StreamPart> {
  return [
    { type: 'stream-start', warnings: [] },
    ...response.content.flatMap((part): Array<LanguageModelV4StreamPart> => {
      if (part.type === 'text') {
        return [
          { type: 'text-start', id: '1' },
          { type: 'text-delta', id: '1', delta: part.text },
          { type: 'text-end', id: '1' },
        ];
      }
      return part.type === 'tool-call' ? [part] : [];
    }),
    {
      type: 'finish',
      finishReason: { unified: response.finishReason, raw: undefined },
      usage,
    },
  ];
}

function createModel(responses: ReadonlyArray<Response>) {
  let call = 0;
  return new MockLanguageModelV4({
    doGenerate: async () => {
      const response = responses[call++];
      return {
        content: response.content,
        finishReason: { unified: response.finishReason, raw: undefined },
        usage,
        warnings: [],
      };
    },
    doStream: async () => ({
      stream: convertArrayToReadableStream(toStream(responses[call++])),
    }),
  });
}

const weather = tool({
  inputSchema: z.object({ city: z.string() }),
  execute: async () => 'sunny',
});

describe.each(['generate', 'stream'] as const)('stoppedBy (%s)', method => {
  async function run({
    responses,
    tools,
    stopWhen,
  }: {
    responses: ReadonlyArray<Response>;
    tools?: ToolSet;
    stopWhen?: StopCondition<ToolSet>;
  }) {
    const onEnd = vi.fn();
    const settings = {
      model: createModel(responses),
      prompt: 'What is the weather in Paris?',
      tools,
      stopWhen,
      onEnd,
    };

    if (method === 'generate') {
      const result = await generateText(settings);
      return {
        result: result.stoppedBy,
        onEnd: onEnd.mock.calls[0][0].stoppedBy,
        finishPart: result.stoppedBy,
      };
    }

    const result = streamText(settings);
    const parts: Array<TextStreamPart<ToolSet>> = [];
    for await (const part of result.fullStream) {
      parts.push(part);
    }
    const finishPart = parts.find(part => part.type === 'finish');
    return {
      result: await result.stoppedBy,
      onEnd: onEnd.mock.calls[0][0].stoppedBy,
      finishPart: finishPart?.type === 'finish' ? finishPart.stoppedBy : null,
    };
  }

  it.each([
    {
      name: 'model when the model gives a final answer',
      responses: [text('It is sunny.')],
      expected: 'model',
    },
    {
      name: 'model when the model answers after tool results',
      responses: [toolCall(), text('It is sunny.')],
      tools: { weather },
      stopWhen: isStepCount(5),
      expected: 'model',
    },
    {
      name: 'stop-condition when a stop condition ends a tool loop',
      responses: [toolCall(), toolCall(), toolCall()],
      tools: { weather },
      stopWhen: isStepCount(2),
      expected: 'stop-condition',
    },
    {
      name: 'tool-without-execute when a tool has no execute function',
      responses: [toolCall()],
      tools: { weather: tool({ inputSchema: z.object({ city: z.string() }) }) },
      stopWhen: isStepCount(5),
      expected: 'tool-without-execute',
    },
    {
      name: 'approval when a tool call needs an approval',
      responses: [toolCall()],
      tools: {
        weather: tool({
          inputSchema: z.object({ city: z.string() }),
          needsApproval: true,
          execute: async () => 'sunny',
        }),
      },
      stopWhen: isStepCount(5),
      expected: 'approval',
    },
    {
      name: 'model when the output limit cuts off a tool call',
      responses: [toolCall('length')],
      tools: { weather },
      stopWhen: isStepCount(5),
      expected: 'model',
    },
    {
      name: 'model when the model call is interrupted',
      responses: [text('It is', 'interrupted')],
      expected: 'model',
    },
  ] as const)('reports $name', async ({ expected, ...settings }) => {
    expect(await run(settings)).toEqual({
      result: expected,
      onEnd: expected,
      finishPart: expected,
    });
  });
});

describe('stoppedBy', () => {
  it.each(['during a step', 'after a step finished'] as const)(
    'rejects like finishReason when a stream is aborted %s',
    async timing => {
      const abortController = new AbortController();
      const onEnd = vi.fn();

      const result = streamText({
        model: createModel([toolCall(), text('It is sunny.')]),
        prompt: 'What is the weather in Paris?',
        tools: {
          weather: tool({
            inputSchema: z.object({ city: z.string() }),
            execute: async () => {
              if (timing === 'during a step') abortController.abort();
              return 'sunny';
            },
          }),
        },
        stopWhen: isStepCount(5),
        abortSignal: abortController.signal,
        onStepEnd: () => {
          if (timing === 'after a step finished') abortController.abort();
        },
        onEnd,
      });

      await result.consumeStream();

      await expect(result.finishReason).rejects.toThrow('aborted');
      await expect(result.stoppedBy).rejects.toThrow('aborted');
      expect(onEnd).not.toHaveBeenCalled();
    },
  );

  it('reports stop-condition when a ToolLoopAgent reaches its default step limit', async () => {
    const agent = new ToolLoopAgent({
      model: createModel(Array.from({ length: 21 }, () => toolCall())),
      tools: { weather },
    });

    const result = await agent.generate({
      prompt: 'What is the weather in Paris?',
    });

    expect(result.steps).toHaveLength(20);
    expect(result.stoppedBy).toBe('stop-condition');
  });
});
