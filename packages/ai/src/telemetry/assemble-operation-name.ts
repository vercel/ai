/**
 * @deprecated This utility is used by un-migrated core functions.
 * Migrated functions use TelemetryEmitter which handles operation
 * name assembly internally via the OTel handler.
 */
export function assembleOperationName({
  operationId,
  telemetry,
}: {
  operationId: string;
  telemetry?: { functionId?: string };
}) {
  return {
    // standardized operation and resource name:
    'operation.name': `${operationId}${
      telemetry?.functionId != null ? ` ${telemetry.functionId}` : ''
    }`,
    'resource.name': telemetry?.functionId,

    // detailed, AI SDK specific data:
    'ai.operationId': operationId,
    'ai.telemetry.functionId': telemetry?.functionId,
  };
}
