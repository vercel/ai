import type { TelemetryOptions } from './workflow-agent.js';

// Minimal OTel type shims so we don't depend on @opentelemetry/api at compile time.
type Attributes = Record<string, unknown>;

type Span = {
  setAttributes(attributes: Attributes): void;
  setStatus(status: { code: number; message?: string }): void;
  recordException(exception: {
    name: string;
    message: string;
    stack?: string;
  }): void;
  end(): void;
};

type Context = unknown;

type Tracer = {
  startActiveSpan<T>(
    name: string,
    options: Attributes,
    fn: (span: Span) => T,
  ): T;
};

// Full OTel API surface we use
interface OtelApi {
  trace: {
    getTracer(name: string): Tracer;
    setSpan(context: Context, span: Span): Context;
  };
  context: {
    active(): Context;
    with<T>(ctx: Context, fn: () => T): T;
  };
  SpanStatusCode: { ERROR: number };
}

// Lazy-loaded OTel API — self-initializes on first use (item 5)
let otelApi: OtelApi | null = null;
let otelLoadAttempted = false;

async function ensureOtelApi(): Promise<OtelApi | null> {
  if (otelLoadAttempted) return otelApi;
  otelLoadAttempted = true;
  try {
    // Dynamic import — @opentelemetry/api is an optional peer dependency.
    // Use Function() to hide the import from bundlers that would fail at
    // compile time when the package is absent.
    otelApi = await (Function(
      'return import("@opentelemetry/api")',
    )() as Promise<OtelApi>);
  } catch {
    otelApi = null;
  }
  return otelApi;
}

/**
 * Stateless tracer accessor matching AI SDK's `getTracer` pattern (item 5).
 * Returns a no-op–equivalent `null` when telemetry is disabled, so callers
 * don't need a separate init step.
 */
function getTracer(telemetry?: TelemetryOptions): Tracer | null {
  if (!telemetry?.isEnabled || !otelApi) return null;
  if (telemetry.tracer) return telemetry.tracer as Tracer;
  return otelApi.trace.getTracer('ai');
}

// ── Attribute helpers ──────────────────────────────────────────────────

/**
 * Assemble `operation.name` / `resource.name` following the AI SDK convention
 * (items 1 + 2): separator is a **space**, not a dot.
 */
function assembleOperationName(
  operationId: string,
  telemetry?: TelemetryOptions,
): Attributes {
  return {
    'operation.name': `${operationId}${
      telemetry?.functionId != null ? ` ${telemetry.functionId}` : ''
    }`,
    'resource.name': telemetry?.functionId,
    'ai.operationId': operationId,
    'ai.telemetry.functionId': telemetry?.functionId,
  };
}

/**
 * Build the full attribute bag for a span, merging operation name,
 * caller-supplied attributes, and user-defined telemetry metadata.
 */
function buildAttributes(
  operationId: string,
  telemetry: TelemetryOptions | undefined,
  extra?: Attributes,
): Attributes {
  if (!telemetry?.isEnabled) return {};

  const attrs: Attributes = {
    ...assembleOperationName(operationId, telemetry),
    ...extra,
  };

  if (telemetry.metadata) {
    for (const [key, value] of Object.entries(telemetry.metadata)) {
      if (value != null) {
        attrs[`ai.telemetry.metadata.${key}`] = value;
      }
    }
  }

  return attrs;
}

// ── Error recording (item 3) ───────────────────────────────────────────

/**
 * Record an error on a span following the AI SDK pattern:
 * `recordException` (with name / message / stack) + `setStatus`.
 */
function recordErrorOnSpan(span: Span, error: unknown): void {
  if (error instanceof Error) {
    span.recordException({
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
    span.setStatus({
      code: otelApi?.SpanStatusCode.ERROR ?? 2,
      message: error.message,
    });
  } else {
    span.setStatus({ code: otelApi?.SpanStatusCode.ERROR ?? 2 });
  }
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Record a span around an async function.
 *
 * Self-initialising: the first call lazily loads `@opentelemetry/api`.
 * If telemetry is disabled or OTel is unavailable the `fn` runs without
 * instrumentation (no-op fast path).
 *
 * Matches the AI SDK's `recordSpan`:
 * - Uses `context.with()` for proper context propagation (item 4)
 * - Calls `recordException` + `setStatus` on errors (item 3)
 * - Uses space separator in `operation.name` (item 1)
 * - Sets `resource.name` (item 2)
 */
export async function recordSpan<T>(options: {
  name: string;
  telemetry?: TelemetryOptions;
  attributes?: Attributes;
  fn: (span?: Span) => PromiseLike<T> | T;
}): Promise<T> {
  // Self-initialise on first call (item 5)
  if (!otelLoadAttempted) {
    await ensureOtelApi();
  }

  const tracer = getTracer(options.telemetry);
  if (!tracer || !otelApi) {
    return options.fn(undefined);
  }

  const attrs = buildAttributes(
    options.name,
    options.telemetry,
    options.attributes,
  );

  return tracer.startActiveSpan(
    options.name,
    { attributes: attrs },
    async span => {
      // Capture current context so nested spans parent correctly (item 4).
      // otelApi is guaranteed non-null here (checked before startActiveSpan).
      const ctx = otelApi!.context.active();

      try {
        const result = await otelApi!.context.with(ctx, () => options.fn(span));
        span.end();
        return result;
      } catch (error) {
        try {
          recordErrorOnSpan(span, error);
        } finally {
          span.end();
        }
        throw error;
      }
    },
  );
}
