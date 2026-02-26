export type SpanType = 'run' | 'step' | 'tool-call' | 'reasoning' | 'text';

export interface Span {
  id: string;
  parentId: string | null;
  type: SpanType;
  label: string;
  startMs: number;
  durationMs: number;
  children: Span[];
  metadata: SpanMetadata;
}

export interface SpanMetadata {
  modelId?: string;
  provider?: string | null;
  usage?: unknown;
  input?: unknown;
  output?: unknown;
  error?: unknown;
  args?: unknown;
  toolCallId?: string;
  toolName?: string;
  success?: boolean;
  stepNumber?: number;
  finishReason?: unknown;
  rawRequest?: unknown;
  rawResponse?: unknown;
  rawChunks?: unknown;
  providerOptions?: unknown;
  content?: string;
  stepRef?: Step;
}

interface Step {
  id: string;
  run_id: string;
  step_number: number;
  type: 'generate' | 'stream';
  model_id: string;
  provider: string | null;
  started_at: string;
  duration_ms: number | null;
  input: string;
  output: string | null;
  usage: string | null;
  error: string | null;
  raw_request: string | null;
  raw_response: string | null;
  raw_chunks: string | null;
  provider_options: string | null;
  tool_calls: string | null;
}

interface Run {
  id: string;
  started_at: string;
}

interface ToolCallTiming {
  toolCallId: string;
  toolName: string;
  started_at: string;
  duration_ms: number;
  args: unknown;
  output: unknown;
  error: unknown;
  success: boolean;
}

function safeParseJson(str: string | null): unknown {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

export function buildTraceTree(run: Run, steps: Step[]): Span {
  const runStartMs = new Date(run.started_at).getTime();
  const totalDurationMs = steps.reduce(
    (sum, s) => sum + (s.duration_ms ?? 0),
    0,
  );

  const rootSpan: Span = {
    id: run.id,
    parentId: null,
    type: 'run',
    label: getRunLabel(steps),
    startMs: 0,
    durationMs: totalDurationMs,
    children: [],
    metadata: {
      usage: getAggregateUsage(steps),
    },
  };

  for (const step of steps) {
    const stepStartMs = new Date(step.started_at).getTime() - runStartMs;
    const stepDurationMs = step.duration_ms ?? 0;
    const output = safeParseJson(step.output) as Record<string, unknown> | null;
    const contentParts = (output?.content ?? []) as Array<
      Record<string, unknown>
    >;

    const stepSpan: Span = {
      id: step.id,
      parentId: run.id,
      type: 'step',
      label: `${step.model_id}:doGenerate`,
      startMs: stepStartMs,
      durationMs: stepDurationMs,
      children: [],
      metadata: {
        modelId: step.model_id,
        provider: step.provider,
        usage: safeParseJson(step.usage),
        input: safeParseJson(step.input),
        output,
        error: step.error,
        stepNumber: step.step_number,
        finishReason: output?.finishReason,
        rawRequest: safeParseJson(step.raw_request),
        rawResponse: safeParseJson(step.raw_response),
        rawChunks: safeParseJson(step.raw_chunks),
        providerOptions: safeParseJson(step.provider_options),
        stepRef: step,
      },
    };

    const toolCallTimings = safeParseJson(step.tool_calls) as
      | ToolCallTiming[]
      | null;
    const toolTimingMap = new Map<string, ToolCallTiming>();
    if (toolCallTimings) {
      for (const tc of toolCallTimings) {
        toolTimingMap.set(tc.toolCallId, tc);
      }
    }

    let childOffsetMs = 0;

    for (const part of contentParts) {
      const partType = part.type as string;

      if (partType === 'reasoning' || partType === 'thinking') {
        const text = (part.text ?? part.reasoning ?? '') as string;
        if (!text) continue;
        const estimatedDuration = estimatePartDuration(
          'reasoning',
          contentParts,
          stepDurationMs,
          toolTimingMap,
        );
        stepSpan.children.push({
          id: `${step.id}-reasoning-${childOffsetMs}`,
          parentId: step.id,
          type: 'reasoning',
          label: 'Thinking',
          startMs: stepStartMs + childOffsetMs,
          durationMs: estimatedDuration,
          children: [],
          metadata: { content: text },
        });
        childOffsetMs += estimatedDuration;
      } else if (partType === 'text') {
        const text = (part.text ?? '') as string;
        if (!text) continue;
        const estimatedDuration = estimatePartDuration(
          'text',
          contentParts,
          stepDurationMs,
          toolTimingMap,
        );
        stepSpan.children.push({
          id: `${step.id}-text-${childOffsetMs}`,
          parentId: step.id,
          type: 'text',
          label: 'Text',
          startMs: stepStartMs + childOffsetMs,
          durationMs: estimatedDuration,
          children: [],
          metadata: { content: text },
        });
        childOffsetMs += estimatedDuration;
      } else if (partType === 'tool-call') {
        const toolCallId = part.toolCallId as string;
        const toolName = part.toolName as string;
        const timing = toolTimingMap.get(toolCallId);

        const tcStartMs = timing
          ? new Date(timing.started_at).getTime() - runStartMs
          : stepStartMs + childOffsetMs;
        const tcDurationMs = timing?.duration_ms ?? 0;

        stepSpan.children.push({
          id: `${step.id}-tc-${toolCallId}`,
          parentId: step.id,
          type: 'tool-call',
          label: toolName,
          startMs: tcStartMs,
          durationMs: tcDurationMs,
          children: [],
          metadata: {
            toolCallId,
            toolName,
            args: timing?.args ?? part.args,
            output: timing?.output,
            error: timing?.error,
            success: timing?.success,
          },
        });
        if (!timing) {
          childOffsetMs += tcDurationMs;
        }
      }
    }

    rootSpan.children.push(stepSpan);
  }

  rootSpan.children.sort((a, b) => a.startMs - b.startMs);
  return rootSpan;
}

function getRunLabel(steps: Step[]): string {
  const firstStep = steps[0];
  if (!firstStep) return 'Empty run';
  const input = safeParseJson(firstStep.input) as Record<
    string,
    unknown
  > | null;
  const prompt = input?.prompt as Array<Record<string, unknown>> | undefined;
  if (!prompt) return 'Run';
  const userMsg = [...prompt].reverse().find(m => m.role === 'user');
  if (!userMsg) return 'Run';
  const content = userMsg.content;
  if (typeof content === 'string') {
    return content.length > 60 ? content.slice(0, 60) + '...' : content;
  }
  if (Array.isArray(content)) {
    const textPart = content.find(
      (p: Record<string, unknown>) => p.type === 'text',
    ) as Record<string, unknown> | undefined;
    const text = (textPart?.text ?? '') as string;
    return text.length > 60 ? text.slice(0, 60) + '...' : text || 'Run';
  }
  return 'Run';
}

function getAggregateUsage(steps: Step[]): unknown {
  let inputTotal = 0;
  let outputTotal = 0;
  for (const step of steps) {
    const usage = safeParseJson(step.usage) as Record<string, unknown> | null;
    if (!usage) continue;
    const inp = usage.inputTokens;
    const out = usage.outputTokens;
    inputTotal +=
      typeof inp === 'number'
        ? inp
        : ((inp as Record<string, number>)?.total ?? 0);
    outputTotal +=
      typeof out === 'number'
        ? out
        : ((out as Record<string, number>)?.total ?? 0);
  }
  return { inputTokens: inputTotal, outputTokens: outputTotal };
}

/**
 * Estimates duration for non-tool content parts by splitting the remaining
 * step time (after subtracting known tool call durations) proportionally.
 */
function estimatePartDuration(
  _partType: 'reasoning' | 'text',
  contentParts: Array<Record<string, unknown>>,
  stepDurationMs: number,
  toolTimingMap: Map<string, ToolCallTiming>,
): number {
  let toolDurationMs = 0;
  for (const [, tc] of toolTimingMap) {
    toolDurationMs += tc.duration_ms;
  }
  const remainingMs = Math.max(0, stepDurationMs - toolDurationMs);

  const nonToolParts = contentParts.filter(p => {
    const t = p.type as string;
    return t === 'text' || t === 'reasoning' || t === 'thinking';
  });
  const count = Math.max(1, nonToolParts.length);
  return Math.round(remainingMs / count);
}

/** Flatten a span tree into a list for rendering rows. */
export function flattenSpans(
  root: Span,
  collapsedIds: Set<string>,
  depth: number = 0,
): Array<{ span: Span; depth: number }> {
  const result: Array<{ span: Span; depth: number }> = [];
  result.push({ span: root, depth });

  if (!collapsedIds.has(root.id)) {
    for (const child of root.children) {
      result.push(...flattenSpans(child, collapsedIds, depth + 1));
    }
  }

  return result;
}
