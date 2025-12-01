import { SpeechModelV2, SpeechModelV3 } from '@ai-sdk/provider';
import { logWarnings } from '../logger/log-warnings';

export function asSpeechModelV3(
  model: SpeechModelV3 | SpeechModelV2,
): SpeechModelV3 {
  if (model.specificationVersion === 'v3') {
    return model;
  }

  // logWarnings({
  //   warnings: [
  //     {
  //       type: 'compatibility',
  //       feature: 'specificationVersion',
  //       details: `This model is using specification version ${model.specificationVersion}. Please upgrade the package to the latest version.`,
  //     },
  //   ],
  //   provider: model.provider,
  //   model: model.modelId,
  // });

  // TODO this could break, we need to properly map v2 to v3
  // and support all relevant v3 properties:
  return new Proxy(model, {
    get(target, prop: keyof SpeechModelV2) {
      if (prop === 'specificationVersion') return 'v3';
      return target[prop];
    },
  }) as unknown as SpeechModelV3;
}
