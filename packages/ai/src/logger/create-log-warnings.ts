import { logWarnings, type LogWarningsFunction } from './log-warnings';

export function createLogWarnings(
  onWarning: LogWarningsFunction | undefined,
): LogWarningsFunction {
  if (onWarning == null) {
    return logWarnings;
  }

  return options => {
    if (options.warnings.length > 0) {
      onWarning(options);
    }
  };
}
