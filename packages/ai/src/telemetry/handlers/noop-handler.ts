import type { TelemetryHandler } from '../types';

/**
 * A telemetry handler that does nothing.
 *
 * Used when telemetry is disabled (no `telemetry` config is provided).
 * Zero overhead — all methods are undefined.
 */
export const noopHandler: TelemetryHandler = {};
