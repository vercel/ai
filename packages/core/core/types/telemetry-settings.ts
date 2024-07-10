import { AttributeValue } from '@opentelemetry/api';

/**
 * Telemetry configuration.
 */
// This is meant to be both flexible for custom app requirements (metadata)
// and extensible for standardization (example: functionId, more to come).
export type TelemetrySettings = {
  /**
   * Enable or disable telemetry. Disabled by default.
   */
  isEnabled?: boolean;

  /**
   * Identifier for this function. Used to group telemetry data by function.
   */
  functionId?: string;

  /**
   * Additional metadata to include in the telemetry data.
   */
  metadata?: Record<string, AttributeValue>;
};
