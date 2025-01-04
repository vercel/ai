import { APICallError, ImageModelV1 } from '@ai-sdk/provider';
import {
  Resolvable,
  postJsonToApi,
  combineHeaders,
  resolve,
  extractResponseHeaders,
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
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: typeof fetch;
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

  constructor(
    readonly modelId: FireworksImageModelId,
    private config: FireworksImageModelConfig,
  ) {}

  async doGenerate({
    prompt,
    n,
    size,
    providerOptions,
    headers,
    abortSignal,
  }: Parameters<ImageModelV1['doGenerate']>[0]): Promise<
    Awaited<ReturnType<ImageModelV1['doGenerate']>>
  > {
    const url = `${this.config.baseURL}/workflows/${this.modelId}/text_to_image`;
    const body = {
      prompt,
      ...(providerOptions.fireworks ?? {}),
    };

    const { value: response } = await postJsonToApi({
      url,
      headers: combineHeaders(await resolve(this.config.headers), headers),
      body,
      failedResponseHandler: statusCodeErrorResponseHandler,
      successfulResponseHandler: createBinaryResponseHandler(),
      abortSignal: abortSignal,
      fetch: this.config.fetch,
    });

    return {
      images: [Buffer.from(response).toString('base64')],
    };
  }
}
