import type {
  OnFinishEvent,
  StreamTextOnChunkCallback,
  StreamTextOnFinishCallback,
  StreamTextOnStartCallback,
  StreamTextOnToolCallFinishCallback,
  TelemetryIntegration,
  ToolSet,
} from 'ai';

export type StreamTextTpsMetrics = {
  ttfcMs?: number;
  ttftMs?: number;
  toolMs: number;
  totalMs: number;
  outputTokens?: number;
  textTokens?: number;
  endToEndTps?: number;
  visibleTextTps?: number;
  visibleTextTpsAfterFirstText?: number;
  approxModelOnlyTps?: number;
};

function calculateTps(tokens: number | undefined, ms: number | undefined) {
  return tokens == null || ms == null || ms <= 0
    ? undefined
    : (tokens * 1000) / ms;
}

function round(value: number | undefined) {
  return value == null ? undefined : Number(value.toFixed(1));
}

export function streamTextTps<TOOLS extends ToolSet = ToolSet>({
  label = 'streamText TPS',
  log = true,
  onFinish,
}: {
  label?: string;
  log?: boolean;
  onFinish?: (options: {
    metrics: StreamTextTpsMetrics;
    event: OnFinishEvent<TOOLS>;
  }) => PromiseLike<void> | void;
} = {}) {
  const meter = {
    startedAt: undefined as number | undefined,
    firstTextAt: undefined as number | undefined,
    ttfcMs: undefined as number | undefined,
    toolMs: 0,
  };

  const telemetry: TelemetryIntegration = {
    onChunk({ chunk }) {
      if (chunk.type !== 'ai.stream.firstChunk') {
        return;
      }

      const ttfcMs = chunk.attributes?.['ai.response.msToFirstChunk'];

      if (typeof ttfcMs === 'number') {
        meter.ttfcMs ??= ttfcMs;
      }
    },
  };

  const experimental_onStart: StreamTextOnStartCallback<TOOLS> = () => {
    meter.startedAt = performance.now();
  };

  const onChunk: StreamTextOnChunkCallback<TOOLS> = ({ chunk }) => {
    if ('type' in chunk && chunk.type === 'text-delta') {
      meter.firstTextAt ??= performance.now();
    }
  };

  const experimental_onToolCallFinish: StreamTextOnToolCallFinishCallback<
    TOOLS
  > = ({ durationMs }) => {
    meter.toolMs += durationMs;
  };

  const handleFinish: StreamTextOnFinishCallback<TOOLS> = async event => {
    const finishedAt = performance.now();
    const startedAt = meter.startedAt ?? finishedAt;
    const totalMs = finishedAt - startedAt;
    const ttftMs =
      meter.firstTextAt == null ? undefined : meter.firstTextAt - startedAt;
    const visibleTextMs =
      meter.firstTextAt == null ? undefined : finishedAt - meter.firstTextAt;
    const modelOnlyMs = Math.max(totalMs - meter.toolMs, 0);

    const metrics: StreamTextTpsMetrics = {
      ttfcMs: round(meter.ttfcMs),
      ttftMs: round(ttftMs),
      toolMs: round(meter.toolMs) ?? 0,
      totalMs: round(totalMs) ?? 0,
      outputTokens: event.totalUsage.outputTokens,
      textTokens: event.totalUsage.outputTokenDetails.textTokens,
      endToEndTps: round(calculateTps(event.totalUsage.outputTokens, totalMs)),
      visibleTextTps: round(
        calculateTps(event.totalUsage.outputTokenDetails.textTokens, totalMs),
      ),
      visibleTextTpsAfterFirstText: round(
        calculateTps(
          event.totalUsage.outputTokenDetails.textTokens,
          visibleTextMs,
        ),
      ),
      approxModelOnlyTps: round(
        calculateTps(event.totalUsage.outputTokens, modelOnlyMs),
      ),
    };

    if (log) {
      console.log(`\n=== ${label} ===`);
      console.table([metrics]);
    }

    await onFinish?.({ metrics, event });
  };

  return {
    experimental_telemetry: {
      isEnabled: true as const,
      integrations: telemetry,
    },
    experimental_onStart,
    onChunk,
    experimental_onToolCallFinish,
    onFinish: handleFinish,
  };
}
