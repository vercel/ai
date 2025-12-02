import { TranscriptionModelV2, TranscriptionModelV3 } from '@ai-sdk/provider';
import { logWarnings } from '../logger/log-warnings';

export function asTranscriptionModelV3(
  model: TranscriptionModelV3 | TranscriptionModelV2,
): TranscriptionModelV3 {
  if (model.specificationVersion === 'v3') {
    return model;
  }

  logWarnings({
    warnings: [
      {
        type: 'compatibility',
        feature: 'specificationVersion',
        details: `Using v2 specification compatibility mode. Some features may not be available.`,
      },
    ],
    provider: model.provider,
    model: model.modelId,
  });

  // TODO this could break, we need to properly map v2 to v3
  // and support all relevant v3 properties:
  return new Proxy(model, {
    get(target, prop: keyof TranscriptionModelV2) {
      if (prop === 'specificationVersion') return 'v3';
      return target[prop];
    },
  }) as unknown as TranscriptionModelV3;
}
