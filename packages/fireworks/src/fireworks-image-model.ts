import {
  APICallError,
  ImageModelV1,
  ImageModelV1CallWarning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  extractResponseHeaders,
  FetchFunction,
  postJsonToApi,
  ResponseHandler,
} from '@ai-sdk/provider-utils';
import {
  FireworksImageModelId,
  FireworksImageSettings,
} from './fireworks-image-settings';

interface FireworksImageModelBackendConfig {
  urlFormat: 'workflows' | 'image_generation';
  supportsSize?: boolean;
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
): string {
  switch (modelToBackendConfig[modelId]?.urlFormat) {
    case 'image_generation':
      return `${baseUrl}/image_generation/${modelId}`;
    case 'workflows':
    default:
      return `${baseUrl}/workflows/${modelId}/text_to_image`;
  }
}

interface FireworksImageModelConfig {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string>;
  fetch?: FetchFunction;
}

const createBinaryResponseHandler =
  (): ResponseHandler<ArrayBuffer> =>
  async ({ response, url, requestBodyValues }) => {
    const responseHeaders = extractResponseHeaders(response);

    if (!response.body) {
      throw new APICallError({
        message: 'Response body is empty',
        url,
        requestBodyValues,
        statusCode: response.status,
        responseHeaders,
        responseBody: undefined,
      });
    }

    try {
      const buffer = await response.arrayBuffer();
      return {
        responseHeaders,
        value: buffer,
      };
    } catch (error) {
      throw new APICallError({
        message: 'Failed to read response as array buffer',
        url,
        requestBodyValues,
        statusCode: response.status,
        responseHeaders,
        responseBody: undefined,
        cause: error,
      });
    }
  };

const statusCodeErrorResponseHandler: ResponseHandler<APICallError> = async ({
  response,
  url,
  requestBodyValues,
}) => {
  const responseHeaders = extractResponseHeaders(response);
  const responseBody = await response.text();

  return {
    responseHeaders,
    value: new APICallError({
      message: response.statusText,
      url,
      requestBodyValues: requestBodyValues as Record<string, unknown>,
      statusCode: response.status,
      responseHeaders,
      responseBody,
    }),
  };
};

export class FireworksImageModel implements ImageModelV1 {
  readonly specificationVersion = 'v1';

  get provider(): string {
    return this.config.provider;
  }

  get maxImagesPerCall(): number {
    return this.settings.maxImagesPerCall ?? 1;
  }

  constructor(
    readonly modelId: FireworksImageModelId,
    readonly settings: FireworksImageSettings,
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
    const { value: response, responseHeaders } = await postJsonToApi({
      url: getUrlForModel(this.config.baseURL, this.modelId),
      headers: combineHeaders(this.config.headers(), headers),
      body: {
        prompt,
        aspect_ratio: aspectRatio,
        seed,
        samples: n,
        ...(splitSize && { width: splitSize[0], height: splitSize[1] }),
        ...(providerOptions.fireworks ?? {}),
      },
      failedResponseHandler: statusCodeErrorResponseHandler,
      successfulResponseHandler: createBinaryResponseHandler(),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      images: [new Uint8Array(response)],
      warnings,
      response: {
        headers: responseHeaders,
      },
    };
  }
}
