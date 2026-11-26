import { notify } from '../util/notify';
import { logWarnings, type LogWarningsFunction } from './log-warnings';

export function createLogWarnings(
  onWarning: LogWarningsFunction | undefined,
): LogWarningsFunction {
  if (onWarning == null) {
    return logWarnings;
  }

  return options => {
    if (options.warnings.length > 0) {
      // like the other callbacks, errors in onWarning do not break the call:
      void notify({ event: options, callbacks: onWarning });
    }
  };
}
