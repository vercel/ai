import { createLogWarnings } from '../logger/create-log-warnings';
import type { LogWarningsFunction } from '../logger/log-warnings';

export function logV2CompatibilityWarning({
  provider,
  modelId,
  onWarning,
}: {
  provider: string;
  modelId: string;
  onWarning?: LogWarningsFunction;
}): void {
  createLogWarnings(onWarning)({
    warnings: [
      {
        type: 'compatibility',
        feature: 'specificationVersion',
        details: `Using v2 specification compatibility mode. Some features may not be available.`,
      },
    ],
    provider,
    model: modelId,
  });
}
