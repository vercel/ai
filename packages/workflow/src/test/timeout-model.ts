import {
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import type {
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';

export type TimeoutScenario = 'stream-stall' | 'two-step' | 'generate-stall';

const usage = {
  inputTokens: {
    total: 3,
    noCache: 2,
    cacheRead: 1,
    cacheWrite: undefined,
  },
  outputTokens: { total: 2, text: 2, reasoning: undefined },
};

function textResult(text: string): LanguageModelV4GenerateResult {
  return {
    content: [{ type: 'text', text }],
    finishReason: { unified: 'stop', raw: 'stop' },
    usage,
    warnings: [],
    response: { id: 'timeout-response', modelId: 'timeout-model' },
  };
}

function toolCallResult(): LanguageModelV4GenerateResult {
  return {
    content: [
      {
        type: 'tool-call',
        toolCallId: 'temperature-call',
        toolName: 'getTemperature',
        input: '{"city":"London"}',
      },
    ],
    finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
    usage,
    warnings: [],
    response: { id: 'timeout-response', modelId: 'timeout-model' },
  };
}

function streamPartsFor(
  result: LanguageModelV4GenerateResult,
): LanguageModelV4StreamPart[] {
  const parts: LanguageModelV4StreamPart[] = [
    { type: 'stream-start', warnings: result.warnings },
    { type: 'response-metadata', ...result.response },
  ];

  for (const [index, part] of result.content.entries()) {
    if (part.type === 'text') {
      const id = `text-${index}`;
      parts.push(
        { type: 'text-start', id },
        { type: 'text-delta', id, delta: part.text },
        { type: 'text-end', id },
      );
    } else if (part.type === 'tool-call') {
      parts.push(part);
    }
  }

  parts.push({
    type: 'finish',
    finishReason: result.finishReason,
    usage: result.usage,
  });

  return parts;
}

function delay(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

/**
 * A stream that sends one text delta and then stays open. It reports the
 * abort signal reason like a provider that honors the signal.
 */
function stalledStream(
  abortSignal: AbortSignal | undefined,
): ReadableStream<LanguageModelV4StreamPart> {
  return new ReadableStream<LanguageModelV4StreamPart>({
    start(controller) {
      controller.enqueue({ type: 'stream-start', warnings: [] });
      controller.enqueue({
        type: 'response-metadata',
        id: 'stalled-response',
        modelId: 'timeout-model',
      });
      controller.enqueue({ type: 'text-start', id: 'text-1' });
      controller.enqueue({ type: 'text-delta', id: 'text-1', delta: 'Hello' });

      let aborted = false;
      const fail = () => {
        if (aborted) return;
        aborted = true;
        try {
          controller.error(abortSignal?.reason);
        } catch {
          // The stream is already closed or errored.
        }
      };
      if (abortSignal?.aborted) {
        fail();
      } else {
        abortSignal?.addEventListener('abort', fail, { once: true });
      }
    },
  });
}

class TimeoutModel extends MockLanguageModelV4 {
  static [WORKFLOW_SERIALIZE](model: TimeoutModel) {
    return { scenario: model.scenario };
  }
  static [WORKFLOW_DESERIALIZE]({ scenario }: { scenario: TimeoutScenario }) {
    return new TimeoutModel(scenario);
  }

  constructor(readonly scenario: TimeoutScenario) {
    super({
      provider: 'timeout-test',
      modelId: 'timeout-model',
      doGenerate: async ({ prompt, abortSignal }) => {
        if (scenario === 'generate-stall') {
          return await new Promise<LanguageModelV4GenerateResult>(
            (_, reject) => {
              if (abortSignal?.aborted) {
                reject(abortSignal.reason);
                return;
              }
              abortSignal?.addEventListener(
                'abort',
                () => reject(abortSignal.reason),
                { once: true },
              );
            },
          );
        }
        if (scenario === 'two-step') {
          await delay(100);
          return prompt.some(message => message.role === 'tool')
            ? textResult('It is 18°C.')
            : toolCallResult();
        }
        return textResult('Done.');
      },
      doStream: async ({ prompt, abortSignal }) => {
        if (scenario === 'stream-stall') {
          return { stream: stalledStream(abortSignal) };
        }
        if (scenario === 'two-step') {
          await delay(100);
          const result = prompt.some(message => message.role === 'tool')
            ? textResult('It is 18°C.')
            : toolCallResult();
          return {
            stream: convertArrayToReadableStream(streamPartsFor(result)),
          };
        }
        return {
          stream: convertArrayToReadableStream(
            streamPartsFor(textResult('Done.')),
          ),
        };
      },
    });
  }
}

// Keep construction outside workflow modules for the SWC closure transform.
export function timeoutModel(scenario: TimeoutScenario): MockLanguageModelV4 {
  return new TimeoutModel(scenario);
}
