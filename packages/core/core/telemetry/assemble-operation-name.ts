import { TelemetrySettings } from './telemetry-settings';

export function assembleOperationName({
  operationName,
  telemetry,
}: {
  operationName: string;
  telemetry?: TelemetrySettings;
}) {
  return {
    'operation.name': `${operationName}${
      telemetry?.functionId != null ? ` ${telemetry.functionId}` : ''
    }`,
  };
}
