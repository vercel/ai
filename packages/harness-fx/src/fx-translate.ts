import type { HarnessV1StreamPart } from '@ai-sdk/harness';
import type {
  LanguageModelV4FinishReason,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import type { FxModelRecord } from './fx-resume-state';
import type { FxModelEnd, FxRuntimeEvent } from './fx-runtime';

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
  emitOnce(input: { key: string; part: HarnessV1StreamPart }): void;
}) {
  const steps = new Map<
    number,
    { finishReason: LanguageModelV4FinishReason; usage: LanguageModelV4Usage }
  >();
  const offsets = new Map<string, number>();

  function onDelta(input: {
    event: Extract<FxRuntimeEvent, { delta: string }>;
    requestIndex: number;
    record: FxModelRecord;
  }) {
    const { event, record, requestIndex } = input;
    const type = event.type === 'text_delta' ? 'text' : 'reasoning';
    const delta = event.delta;
    const id = `${options.turnId}:${requestIndex}:${record.attempt}:${type}`;
    const start = offsets.get(id) ?? 0;
    offsets.set(id, start + delta.length);
    const output = (record.emittedOutput ??= { text: 0, reasoning: 0 });
    const unseen = delta.slice(Math.max(0, output[type] - start));
    if (!unseen) return;
    if (output[type] === 0)
      options.emitOnce({
        key: `${id}:start`,
        part: { type: `${type}-start`, id },
      });
    output[type] = start + delta.length;
    options.emit({ type: `${type}-delta`, id, delta: unseen });
  }

  function endOutput(input: { requestIndex: number; record: FxModelRecord }) {
    const { record, requestIndex } = input;
    const output = record.emittedOutput;
    if (output && !output.finished) {
      for (const type of ['text', 'reasoning'] as const) {
        if (output[type] === 0) continue;
        const id = `${options.turnId}:${requestIndex}:${record.attempt}:${type}`;
        options.emitOnce({
          key: `${id}:end`,
          part: { type: `${type}-end`, id },
        });
      }
      output.finished = true;
    }
  }

  function onModelEnd(input: { data: FxModelEnd; requestIndex: number }) {
    const { data, requestIndex } = input;
    if (!data.usage && !data.finishReason) return;
    const usage = emptyFxUsage();
    usage.inputTokens.total = data.usage?.inputTokens ?? undefined;
    usage.inputTokens.cacheRead = data.usage?.cacheReadTokens ?? undefined;
    usage.inputTokens.cacheWrite = data.usage?.cacheWriteTokens ?? undefined;
    usage.outputTokens.total = data.usage?.outputTokens ?? undefined;
    usage.outputTokens.reasoning = data.usage?.reasoningTokens ?? undefined;
    if (usage.inputTokens.total != null)
      usage.inputTokens.noCache =
        usage.inputTokens.total -
        (usage.inputTokens.cacheRead ?? 0) -
        (usage.inputTokens.cacheWrite ?? 0);
    if (usage.outputTokens.total != null)
      usage.outputTokens.text =
        usage.outputTokens.total - (usage.outputTokens.reasoning ?? 0);
    steps.set(requestIndex, {
      finishReason: {
        unified: (data.finishReason ??
          'other') as LanguageModelV4FinishReason['unified'],
        raw: data.finishReason ?? undefined,
      },
      usage,
    });
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
  return { onDelta, endOutput, onModelEnd, steps, totalUsage };
}
