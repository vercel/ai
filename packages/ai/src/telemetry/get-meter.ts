import { Meter, metrics } from '@opentelemetry/api';
import { noopMeter } from './noop-meter';

/**
 * Get a meter for recording metrics.
 *
 * @param options - Options for getting the meter.
 * @param options.isEnabled - Whether telemetry is enabled. If false, returns a noop meter.
 * @param options.meter - A custom meter to use. If not provided, uses the global meter provider.
 * @returns A meter instance for recording metrics.
 */
export function getMeter({
  isEnabled = false,
  meter,
}: {
  isEnabled?: boolean;
  meter?: Meter;
} = {}): Meter {
  if (!isEnabled) {
    return noopMeter;
  }

  if (meter) {
    return meter;
  }

  return metrics.getMeter('ai');
}
