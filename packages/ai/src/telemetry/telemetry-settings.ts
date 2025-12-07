import { AttributeValue, Meter, Tracer } from '@opentelemetry/api';

/**
 * Telemetry configuration.
 */
// This is meant to be both flexible for custom app requirements (metadata)
// and extensible for standardization (example: functionId, more to come).
export type TelemetrySettings = {
  /**
   * Enable or disable telemetry. Disabled by default while experimental.
   */
  isEnabled?: boolean;

  /**
   * Enable or disable input recording. Enabled by default.
   *
   * You might want to disable input recording to avoid recording sensitive
   * information, to reduce data transfers, or to increase performance.
   */
  recordInputs?: boolean;

  /**
   * Enable or disable output recording. Enabled by default.
   *
   * You might want to disable output recording to avoid recording sensitive
   * information, to reduce data transfers, or to increase performance.
   */
  recordOutputs?: boolean;

  /**
   * Identifier for this function. Used to group telemetry data by function.
   */
  functionId?: string;

  /**
   * Additional information to include in the telemetry data.
   */
  metadata?: Record<string, AttributeValue>;

  /**
   * A custom tracer to use for the telemetry data.
   */
  tracer?: Tracer;

  /**
   * Enable or disable metrics recording. Enabled by default when telemetry is enabled.
   *
   * Metrics provide aggregated statistics like request counts, token usage,
   * and latency distributions that are useful for monitoring and alerting.
   */
  recordMetrics?: boolean;

  /**
   * A custom meter to use for recording metrics.
   *
   * If not provided and metrics are enabled, uses the global meter provider
   * with the meter name 'ai'.
   */
  meter?: Meter;
};
