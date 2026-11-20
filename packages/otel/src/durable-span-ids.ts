import {
  context,
  trace,
  TraceFlags,
  createTraceState,
  isSpanContextValid,
  type Attributes,
  type Context,
  type Link,
  type SpanKind,
  type TraceState,
} from '@opentelemetry/api';
import type { DurableTelemetryContext } from 'ai';

/** Compatible with the OpenTelemetry SDK's Sampler interface. */
type Sampler = {
  shouldSample(
    parentContext: Context,
    traceId: string,
    spanName: string,
    spanKind: SpanKind,
    attributes: Attributes,
    links: Link[],
  ): {
    decision: 0 | 1 | 2;
    traceState?: TraceState;
    attributes?: Attributes;
  };
};

/**
 * Instance-scoped SDK bridge for durable tracing. Pass the same instance as
 * the SDK's idGenerator and sampler, and as OpenTelemetry's durable option.
 * Without a custom sampler, uses parent-based sampling with roots enabled.
 */
export class OpenTelemetryIdGenerator {
  private requested?: {
    traceId?: string;
    spanId?: string;
    samplingDecision?: 0 | 1 | 2;
    traceState?: string;
  };

  constructor(private readonly options: { sampler?: Sampler } = {}) {}

  generateTraceId(): string {
    const requested = this.requested?.traceId;
    if (requested == null) return randomHex(16);
    this.requested!.traceId = undefined;
    return requested;
  }

  generateSpanId(): string {
    const requested = this.requested?.spanId;
    if (requested == null) return randomHex(8);
    this.requested!.spanId = undefined;
    return requested;
  }

  shouldSample(
    ...args: Parameters<Sampler['shouldSample']>
  ): ReturnType<Sampler['shouldSample']> {
    if (this.requested?.samplingDecision != null) {
      return {
        decision: this.requested.samplingDecision,
        traceState:
          this.requested.traceState == null
            ? trace.getSpanContext(args[0])?.traceState
            : createTraceState(this.requested.traceState),
      };
    }
    if (this.options.sampler != null)
      return this.options.sampler.shouldSample(...args);
    const parent = trace.getSpanContext(args[0]);
    return {
      decision:
        parent == null ||
        !isSpanContextValid(parent) ||
        (parent.traceFlags & TraceFlags.SAMPLED) !== 0
          ? 2
          : 0,
      traceState: parent?.traceState,
    };
  }

  toString(): string {
    return 'AiSdkDurableSampler';
  }

  captureContext(
    callId: string,
    name: string,
    kind: SpanKind,
    attributes: Attributes,
  ): DurableTelemetryContext {
    const activeParent = trace.getSpanContext(context.active());
    const parent =
      activeParent != null && isSpanContextValid(activeParent)
        ? activeParent
        : undefined;
    const traceId = parent?.traceId ?? deriveTraceId(callId);
    const sampling = this.shouldSample(
      context.active(),
      traceId,
      name,
      kind,
      attributes,
      [],
    );
    return {
      traceId,
      rootSpanId: deriveSpanId(callId, 'root'),
      traceFlags:
        sampling.decision === 2 ? TraceFlags.SAMPLED : TraceFlags.NONE,
      samplingDecision: sampling.decision,
      rootAttributes: { ...attributes, ...sampling.attributes },
      traceState:
        sampling.traceState?.serialize() ?? parent?.traceState?.serialize(),
      ...(parent == null
        ? {}
        : {
            parentSpanContext: {
              traceId: parent.traceId,
              spanId: parent.spanId,
              traceFlags: parent.traceFlags,
              traceState: parent.traceState?.serialize(),
            },
          }),
    };
  }

  /** Scope requested IDs to this bridge and restore nested requests. */
  withIds<T>(
    ids: {
      traceId?: string;
      spanId?: string;
      samplingDecision?: 0 | 1 | 2;
      traceState?: string;
    },
    startSpan: () => T,
  ): T {
    const previous = this.requested;
    this.requested = { ...ids };
    try {
      return startSpan();
    } finally {
      this.requested = previous;
    }
  }
}

/** Derives the trace ID of a durable run from its telemetry call ID. */
export function deriveTraceId(callId: string): string {
  return deriveHex(`${callId}:trace`, 4);
}

/** Derives a span ID of a durable run from its telemetry call ID. */
export function deriveSpanId(callId: string, ...path: Array<string | number>) {
  return deriveHex([callId, ...path].join(':'), 2);
}

function randomHex(bytes: number): string {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  const hex = Array.from(values, value =>
    value.toString(16).padStart(2, '0'),
  ).join('');
  return nonZero(hex);
}

/**
 * Non-cryptographic hash (FNV-1a with one seed per 32-bit word). Collisions
 * only matter between spans of the same run.
 */
function deriveHex(input: string, words: number): string {
  let hex = '';
  for (let word = 0; word < words; word++) {
    let hash = (0x811c9dc5 ^ Math.imul(word + 1, 0x9e3779b1)) >>> 0;
    for (let index = 0; index < input.length; index++) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    hex += hash.toString(16).padStart(8, '0');
  }
  return nonZero(hex);
}

/** All-zero IDs are invalid in OpenTelemetry. */
function nonZero(hex: string): string {
  return /^0+$/.test(hex) ? `${hex.slice(0, -1)}1` : hex;
}
