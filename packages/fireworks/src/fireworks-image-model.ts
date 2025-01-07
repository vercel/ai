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

// https://fireworks.ai/models?type=image
export type FireworksImageModelId =
  | 'accounts/fireworks/models/flux-1-dev-fp8'
  | 'accounts/fireworks/models/flux-1-schnell-fp8'
  | (string & {});

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

    if (size != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'size',
        details:
          'This model does not support the `size` option. Use `aspectRatio` instead.',
      });
    }

    const url = `${this.config.baseURL}/workflows/${this.modelId}/text_to_image`;
    const body = {
      prompt,
      aspect_ratio: aspectRatio,
      seed,
      ...(providerOptions.fireworks ?? {}),
    };

    const { value: response } = await postJsonToApi({
      url,
      headers: combineHeaders(this.config.headers(), headers),
      body,
      failedResponseHandler: statusCodeErrorResponseHandler,
      successfulResponseHandler: createBinaryResponseHandler(),
      abortSignal,
      fetch: this.config.fetch,
    });

    return { images: [new Uint8Array(response)], warnings };
  }
}
