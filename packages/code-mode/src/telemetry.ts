import { serializeError } from './errors.js';
import type { CodeModeTelemetryOptions } from './types.js';

type AttributeValue =
  | string
  | number
  | boolean
  | Array<string | number | boolean>;
type Attributes = Record<string, AttributeValue>;

interface TelemetrySpan {
  setAttribute?: (key: string, value: AttributeValue) => void;
  setAttributes?: (attributes: Attributes) => void;
  addEvent?: (name: string, attributes?: Attributes) => void;
  recordException?: (exception: Error | string | unknown) => void;
  setStatus?: (status: { code: number; message?: string }) => void;
  end?: () => void;
}

interface TelemetryTracer {
  startSpan?: (
    name: string,
    options?: { attributes?: Attributes },
  ) => TelemetrySpan;
}

const SPAN_STATUS_ERROR = 2;

export function startTelemetrySpan(
  telemetry: CodeModeTelemetryOptions | undefined,
  name: string,
  attributes: Record<string, unknown>,
): TelemetrySpan | undefined {
  if (telemetry?.isEnabled !== true) {
    return undefined;
  }

  const tracer = telemetry.tracer as TelemetryTracer | undefined;
  const span = tracer?.startSpan?.(name, {
    attributes: compactAttributes({
      ...baseTelemetryAttributes(telemetry),
      ...attributes,
    }),
  });
  return span;
}

export function addTelemetryEvent(
  span: TelemetrySpan | undefined,
  name: string,
  attributes: Record<string, unknown> = {},
): void {
  span?.addEvent?.(name, compactAttributes(attributes));
}

export function recordTelemetryError(
  span: TelemetrySpan | undefined,
  error: unknown,
): void {
  if (span === undefined) {
    return;
  }
  const serialized = serializeError(error);
  span.recordException?.(error);
  span.setStatus?.({
    code: SPAN_STATUS_ERROR,
    message: serialized.message,
  });
  span.setAttributes?.(
    compactAttributes({
      'code_mode.error.name': serialized.name,
      'code_mode.error.message': serialized.message,
      'code_mode.error.code': serialized.code,
    }),
  );
}

export function endTelemetrySpan(span: TelemetrySpan | undefined): void {
  span?.end?.();
}

function baseTelemetryAttributes(
  telemetry: CodeModeTelemetryOptions,
): Record<string, unknown> {
  return {
    'ai.telemetry.functionId': telemetry.functionId,
    'resource.name': telemetry.functionId,
    ...Object.fromEntries(
      Object.entries(telemetry.metadata ?? {}).map(([key, value]) => [
        `ai.telemetry.metadata.${key}`,
        value,
      ]),
    ),
  };
}

function compactAttributes(attributes: Record<string, unknown>): Attributes {
  const compact: Attributes = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      compact[key] = value;
      continue;
    }
    if (
      Array.isArray(value) &&
      value.every(
        item =>
          typeof item === 'string' ||
          typeof item === 'number' ||
          typeof item === 'boolean',
      )
    ) {
      compact[key] = value;
    }
  }
  return compact;
}
