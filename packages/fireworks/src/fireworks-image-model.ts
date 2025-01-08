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
  postToApi,
  ResponseHandler,
} from '@ai-sdk/provider-utils';

// https://fireworks.ai/models?type=image
export type FireworksImageModelId =
  | 'accounts/fireworks/models/flux-1-dev-fp8'
  | 'accounts/fireworks/models/flux-1-schnell-fp8'
  | 'accounts/fireworks/models/playground-v2-5-1024px-aesthetic'
  | 'accounts/fireworks/models/japanese-stable-diffusion-xl'
  | 'accounts/fireworks/models/playground-v2-1024px-aesthetic'
  | 'accounts/fireworks/models/SSD-1B'
  | 'accounts/fireworks/models/stable-diffusion-xl-1024-v1-0'
  | 'accounts/stability/models/sd3-turbo'
  | 'accounts/stability/models/sd3-medium'
  | 'accounts/stability/models/sd3'
  | (string & {});

interface FireworksImageModelBackendConfig {
  urlFormat: 'workflows' | 'image_generation' | 'stability';
  // Fireworks models use Fireworks API keys and accept a JSON request body.
  // Stability AI models require a Stable Diffusion API key, a
  // multi-part/form-data request, and the model is specified as `model`:
  // <model-id> in the form data.
  api: 'fireworks' | 'stability';
  supportsSize?: boolean;
}

const modelToBackendConfig: Partial<
  Record<FireworksImageModelId, FireworksImageModelBackendConfig>
> = {
  'accounts/fireworks/models/flux-1-dev-fp8': {
    urlFormat: 'workflows',
    api: 'fireworks',
  },
  'accounts/fireworks/models/flux-1-schnell-fp8': {
    urlFormat: 'workflows',
    api: 'fireworks',
  },
  'accounts/fireworks/models/playground-v2-5-1024px-aesthetic': {
    urlFormat: 'image_generation',
    api: 'fireworks',
    supportsSize: true,
  },
  'accounts/fireworks/models/japanese-stable-diffusion-xl': {
    urlFormat: 'image_generation',
    api: 'fireworks',
    supportsSize: true,
  },
  'accounts/fireworks/models/playground-v2-1024px-aesthetic': {
    urlFormat: 'image_generation',
    api: 'fireworks',
    supportsSize: true,
  },
  'accounts/fireworks/models/stable-diffusion-xl-1024-v1-0': {
    urlFormat: 'image_generation',
    api: 'fireworks',
    supportsSize: true,
  },
  'accounts/fireworks/models/SSD-1B': {
    urlFormat: 'image_generation',
    api: 'fireworks',
    supportsSize: true,
  },
  'accounts/stability/models/sd3-turbo': {
    urlFormat: 'stability',
    api: 'stability',
  },
  'accounts/stability/models/sd3-medium': {
    urlFormat: 'stability',
    api: 'stability',
  },
  'accounts/stability/models/sd3': {
    urlFormat: 'stability',
    api: 'stability',
  },
};

function getUrlForModel(
  baseUrl: string,
  modelId: FireworksImageModelId,
): string {
  const workflowsUrl = `${baseUrl}/workflows/${modelId}/text_to_image`;
  switch (modelToBackendConfig[modelId]?.urlFormat) {
    case 'image_generation':
      return `${baseUrl}/image_generation/${modelId}`;
    case 'stability':
      // For stability models the model id is passed in the form data of the
      // request rather than as a part of the url.
      return `https://api.stability.ai/v2beta/stable-image/generate/sd3`;
    case 'workflows':
      return workflowsUrl;
  }
  return workflowsUrl;
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

interface ImageRequestParams {
  baseUrl: string;
  modelId: FireworksImageModelId;
  prompt: string;
  aspectRatio?: string;
  size?: string;
  seed?: number;
  providerOptions: Record<string, unknown>;
  headers: Record<string, string | undefined>;
  abortSignal?: AbortSignal;
  fetch?: FetchFunction;
}

async function postImageToFireworksApi(
  params: ImageRequestParams,
): Promise<ArrayBuffer> {
  const splitSize = params.size?.split('x');
  const { value: response } = await postJsonToApi({
    url: getUrlForModel(params.baseUrl, params.modelId),
    headers: params.headers,
    body: {
      prompt: params.prompt,
      aspect_ratio: params.aspectRatio,
      seed: params.seed,
      ...(splitSize && { width: splitSize[0], height: splitSize[1] }),
      ...(params.providerOptions.fireworks ?? {}),
    },
    failedResponseHandler: statusCodeErrorResponseHandler,
    successfulResponseHandler: createBinaryResponseHandler(),
    abortSignal: params.abortSignal,
    fetch: params.fetch,
  });

  return response;
}

function getModelNameForStability(modelId: FireworksImageModelId): string {
  const parts = modelId.split('/');
  return parts[parts.length - 1];
}

async function postImageToStabilityApi(
  params: ImageRequestParams,
): Promise<ArrayBuffer> {
  const formData = new FormData();
  formData.append('mode', 'text-to-image');
  formData.append('prompt', params.prompt);
  formData.append('aspect_ratio', params.aspectRatio ?? '1:1');
  formData.append('output_format', 'png');
  formData.append('model', getModelNameForStability(params.modelId));
  if (params.seed != null) {
    formData.append('seed', params.seed.toString());
  }

  const providerOptions = params.providerOptions;
  if (
    providerOptions.fireworks &&
    typeof providerOptions.fireworks === 'object'
  ) {
    for (const [key, value] of Object.entries(providerOptions.fireworks)) {
      if (value !== undefined && value !== null) {
        const stringValue =
          typeof value === 'object' ? JSON.stringify(value) : String(value);
        formData.set(key, stringValue);
      }
    }
  }

  const { value: response } = await postToApi({
    url: getUrlForModel(params.baseUrl, params.modelId),
    headers: {
      ...params.headers,
      Accept: 'image/*',
    },
    body: {
      content: formData,
      values: {},
    },
    failedResponseHandler: statusCodeErrorResponseHandler,
    successfulResponseHandler: createBinaryResponseHandler(),
    abortSignal: params.abortSignal,
    fetch: params.fetch,
  });

  return response;
}

async function postImageToApi(
  params: ImageRequestParams,
): Promise<ArrayBuffer> {
  return modelToBackendConfig[params.modelId]?.api === 'stability'
    ? postImageToStabilityApi(params)
    : postImageToFireworksApi(params);
}

export class FireworksImageModel implements ImageModelV1 {
  readonly specificationVersion = 'v1';

  get provider(): string {
    return this.config.provider;
  }

  readonly maxImagesPerCall = 1;

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

    const response = await postImageToApi({
      baseUrl: this.config.baseURL,
      prompt,
      aspectRatio,
      size,
      seed,
      modelId: this.modelId,
      providerOptions,
      headers: combineHeaders(this.config.headers(), headers),
      abortSignal,
      fetch: this.config.fetch,
    });

    return { images: [new Uint8Array(response)], warnings };
  }
}
