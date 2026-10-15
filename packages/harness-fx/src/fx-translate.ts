import type { HarnessV1StreamPart } from '@ai-sdk/harness';
import type {
  LanguageModelV4FinishReason,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import type { FxGatewayPart } from './fx-transport';

export type FxGatewayToolCall = {
  toolCallId: string;
  toolName: string;
  input: unknown;
};

export function emptyFxUsage(): LanguageModelV4Usage {
  return {
    inputTokens: {
      total: undefined,
      noCache: undefined,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: { total: undefined, text: undefined, reasoning: undefined },
  };
}

export function createFxTranslator(options: {
  turnId: string;
  emit(part: HarnessV1StreamPart): void;
}) {
  const toolCalls = new Map<number, FxGatewayToolCall[]>();
  const steps = new Map<
    number,
    { finishReason: LanguageModelV4FinishReason; usage: LanguageModelV4Usage }
  >();
  function onPart(input: {
    part: FxGatewayPart;
    requestIndex: number;
    attempt: number;
    suppress: boolean;
  }) {
    const { part } = input;
    if (
      part.type === 'tool-call' &&
      part.providerExecuted !== true &&
      typeof part.toolCallId === 'string' &&
      typeof part.toolName === 'string'
    ) {
      const calls = toolCalls.get(input.requestIndex) ?? [];
      if (!calls.some(call => call.toolCallId === part.toolCallId)) {
        calls.push({
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: part.input,
        });
      }
      toolCalls.set(input.requestIndex, calls);
    }
    if (part.type === 'finish') {
      steps.set(input.requestIndex, {
        finishReason: part.finishReason as LanguageModelV4FinishReason,
        usage: (part.usage as LanguageModelV4Usage) ?? emptyFxUsage(),
      });
    }
    if (input.suppress) return;
    const id = `${options.turnId}:${input.requestIndex}:${input.attempt}:${String(part.id ?? '0')}`;
    switch (part.type) {
      case 'text-start':
      case 'text-end':
      case 'reasoning-start':
      case 'reasoning-end':
        options.emit({ type: part.type, id });
        break;
      case 'text-delta':
      case 'reasoning-delta':
        options.emit({ type: part.type, id, delta: String(part.delta ?? '') });
        break;
      case 'error':
        options.emit({ type: 'error', error: part.error });
        break;
    }
  }
  function totalUsage(): LanguageModelV4Usage {
    const total = emptyFxUsage();
    for (const step of steps.values()) {
      for (const group of ['inputTokens', 'outputTokens'] as const) {
        const target = total[group] as Record<string, number | undefined>;
        for (const [key, value] of Object.entries(step.usage[group])) {
          if (typeof value === 'number')
            target[key] = (target[key] ?? 0) + value;
        }
      }
    }
    return total;
  }
  return { onPart, steps, toolCalls, totalUsage };
}
