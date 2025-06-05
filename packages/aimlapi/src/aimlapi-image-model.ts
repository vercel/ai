import { ImageModelV1, ImageModelV1CallWarning } from '@ai-sdk/provider';
import {
  combineHeaders,
  createBinaryResponseHandler,
  createStatusCodeErrorResponseHandler,
  FetchFunction,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { AIMLAPIImageModelId, AimlapiImageSettings } from './aimlapi-image-settings';

interface AIMLAPIImageModelBackendConfig {
  urlFormat: 'image_generation';
  supportsSize?: boolean;
}

const modelToBackendConfig: Partial<
  Record<AIMLAPIImageModelId, AIMLAPIImageModelBackendConfig>
> = {
  'dall-e-2': { urlFormat: "image_generation", supportsSize: false },
  'dall-e-3': { urlFormat: "image_generation", supportsSize: false },
  'imagen-3.0-generate-002': { urlFormat: "image_generation", supportsSize: true },
  'flux-pro': { urlFormat: "image_generation", supportsSize: true },
  'flux-pro/v1.1': { urlFormat: "image_generation", supportsSize: true },
  'flux-pro/v1.1-ultra': { urlFormat: "image_generation", supportsSize: true },
  'stable-diffusion-v3-medium': { urlFormat: "image_generation", supportsSize: true },
  'stable-diffusion-v35-large': { urlFormat: "image_generation", supportsSize: true },
  'flux-realism': { urlFormat: "image_generation", supportsSize: true },
  'recraft-v3': { urlFormat: "image_generation", supportsSize: true },
  'triposr': { urlFormat: "image_generation", supportsSize: true },
  'google/imagen4/preview': { urlFormat: "image_generation", supportsSize: true },
};

function getUrlForModel(
  baseUrl: string,
  modelId: AIMLAPIImageModelId,
): string {
  switch (modelToBackendConfig[modelId]?.urlFormat) {
    case 'image_generation':
    default:
      return `${baseUrl}/images/generations`;
  }
}

interface AIMLAPIImageModelConfig {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
}

export class AimlapiImageModel implements ImageModelV1 {
  readonly specificationVersion = 'v1';

  get provider(): string {
    return this.config.provider;
  }

  get maxImagesPerCall(): number {
    return this.settings.maxImagesPerCall ?? 1;
  }

  constructor(
    readonly modelId: AIMLAPIImageModelId,
    readonly settings: AimlapiImageSettings,
    private config: AIMLAPIImageModelConfig,
  ) {
  }

  async doGenerate({
                     prompt,
                     n,
                     size,
                     aspectRatio,
                     seed,
                     providerOptions,
                     headers,
                     abortSignal,
                   }: Parameters<ImageModelV1['doGenerate']>[0]): Promise<
    Awaited<ReturnType<ImageModelV1['doGenerate']>>
  > {
    const warnings: Array<ImageModelV1CallWarning> = [];

    const backendConfig = modelToBackendConfig[this.modelId];
    if (!backendConfig?.supportsSize && size != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'size',
        details:
          'This model does not support the `size` option. Use `aspectRatio` instead.',
      });
    }

    // Use supportsSize as a proxy for whether the model does not support
    // aspectRatio. This invariant holds for the current set of models.
    if (backendConfig?.supportsSize && aspectRatio != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'aspectRatio',
        details: 'This model does not support the `aspectRatio` option.',
      });
    }

    const splitSize = size?.split('x');
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { value: response, responseHeaders } = await postJsonToApi({
      url: getUrlForModel(this.config.baseURL, this.modelId),
      headers: combineHeaders(this.config.headers(), headers),
      body: {
        prompt,
        aspect_ratio: aspectRatio,
        seed,
        ...(splitSize && { width: splitSize[0], height: splitSize[1] }),
        ...(providerOptions.fireworks ?? {}),
      },
      failedResponseHandler: createStatusCodeErrorResponseHandler(),
      successfulResponseHandler: createBinaryResponseHandler(),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      images: [response],
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
    };
  }
}
