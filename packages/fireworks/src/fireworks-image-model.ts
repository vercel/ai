import { ImageModelV3, SharedV3Warning } from '@ai-sdk/provider';
import {
  combineHeaders,
  convertImageModelFileToDataUri,
  createBinaryResponseHandler,
  createStatusCodeErrorResponseHandler,
  FetchFunction,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { FireworksImageModelId } from './fireworks-image-options';

interface FireworksImageModelBackendConfig {
  urlFormat: 'workflows' | 'workflows_edit' | 'image_generation';
  supportsSize?: boolean;
  supportsEditing?: boolean;
}

const modelToBackendConfig: Partial<
  Record<FireworksImageModelId, FireworksImageModelBackendConfig>
> = {
  'accounts/fireworks/models/flux-1-dev-fp8': {
    urlFormat: 'workflows',
  },
  'accounts/fireworks/models/flux-1-schnell-fp8': {
    urlFormat: 'workflows',
  },
  'accounts/fireworks/models/flux-kontext-pro': {
    urlFormat: 'workflows_edit',
    supportsEditing: true,
  },
  'accounts/fireworks/models/flux-kontext-max': {
    urlFormat: 'workflows_edit',
    supportsEditing: true,
  },
  'accounts/fireworks/models/playground-v2-5-1024px-aesthetic': {
    urlFormat: 'image_generation',
    supportsSize: true,
  },
  'accounts/fireworks/models/japanese-stable-diffusion-xl': {
    urlFormat: 'image_generation',
    supportsSize: true,
  },
  'accounts/fireworks/models/playground-v2-1024px-aesthetic': {
    urlFormat: 'image_generation',
    supportsSize: true,
  },
  'accounts/fireworks/models/stable-diffusion-xl-1024-v1-0': {
    urlFormat: 'image_generation',
    supportsSize: true,
  },
  'accounts/fireworks/models/SSD-1B': {
    urlFormat: 'image_generation',
    supportsSize: true,
  },
};

function getUrlForModel(
  baseUrl: string,
  modelId: FireworksImageModelId,
  hasInputImage: boolean,
): string {
  const config = modelToBackendConfig[modelId];

  switch (config?.urlFormat) {
    case 'image_generation':
      return `${baseUrl}/image_generation/${modelId}`;
    case 'workflows_edit':
      // Kontext models: use base URL for editing (no suffix)
      return `${baseUrl}/workflows/${modelId}`;
    case 'workflows':
    default:
      // Standard FLUX models: use text_to_image for generation,
      // but if input_image provided, some models may support editing
      if (hasInputImage && config?.supportsEditing) {
        return `${baseUrl}/workflows/${modelId}`;
      }
      return `${baseUrl}/workflows/${modelId}/text_to_image`;
  }
}

interface FireworksImageModelConfig {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
}

export class FireworksImageModel implements ImageModelV3 {
  readonly specificationVersion = 'v3';
  readonly maxImagesPerCall = 1;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: FireworksImageModelId,
    private config: FireworksImageModelConfig,
  ) {}

  async doGenerate({
    prompt,
    n,
    size,
    aspectRatio,
    seed,
    providerOptions,
    headers,
    abortSignal,
    files,
    mask,
  }: Parameters<ImageModelV3['doGenerate']>[0]): Promise<
    Awaited<ReturnType<ImageModelV3['doGenerate']>>
  > {
    const warnings: Array<SharedV3Warning> = [];

    const backendConfig = modelToBackendConfig[this.modelId];
    if (!backendConfig?.supportsSize && size != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'size',
        details:
          'This model does not support the `size` option. Use `aspectRatio` instead.',
      });
    }

    // Use supportsSize as a proxy for whether the model does not support
    // aspectRatio. This invariant holds for the current set of models.
    if (backendConfig?.supportsSize && aspectRatio != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'aspectRatio',
        details: 'This model does not support the `aspectRatio` option.',
      });
    }

    // Handle files for image editing
    const hasInputImage = files != null && files.length > 0;
    let inputImage: string | undefined;

    if (hasInputImage) {
      inputImage = convertImageModelFileToDataUri(files[0]);

      if (files.length > 1) {
        warnings.push({
          type: 'other',
          message:
            'Fireworks only supports a single input image. Additional images are ignored.',
        });
      }
    }

    // Warn about mask - Fireworks Kontext models don't support explicit masks
    if (mask != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'mask',
        details:
          'Fireworks Kontext models do not support explicit masks. Use the prompt to describe the areas to edit.',
      });
    }

    const splitSize = size?.split('x');
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { value: response, responseHeaders } = await postJsonToApi({
      url: getUrlForModel(this.config.baseURL, this.modelId, hasInputImage),
      headers: combineHeaders(this.config.headers(), headers),
      body: {
        prompt,
        aspect_ratio: aspectRatio,
        seed,
        samples: n,
        ...(inputImage && { input_image: inputImage }),
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
