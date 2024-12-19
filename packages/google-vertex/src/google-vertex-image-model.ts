import { ImageModelV1, JSONValue } from '@ai-sdk/provider';
import {
  Resolvable,
  postJsonToApi,
  combineHeaders,
  createJsonResponseHandler,
  resolve,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { googleVertexFailedResponseHandler } from './google-vertex-error';

export type GoogleVertexImageModelId =
  | 'imagen-3.0-generate-001'
  | 'imagen-3.0-fast-generate-001';

interface GoogleVertexImageModelConfig {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: typeof fetch;
}

// https://cloud.google.com/vertex-ai/generative-ai/docs/image/generate-images
export class GoogleVertexImageModel implements ImageModelV1 {
  readonly specificationVersion = 'v1';

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: GoogleVertexImageModelId,
    private config: GoogleVertexImageModelConfig,
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
    if (size) {
      throw new Error(
        'Google Vertex does not support the `size` option. Use ' +
          '`providerOptions.vertex.aspectRatio` instead. See ' +
          'https://cloud.google.com/vertex-ai/generative-ai/docs/image/generate-images#aspect-ratio',
      );
    }

    const body = {
      instances: [{ prompt }],
      parameters: {
        sampleCount: n,
        ...(providerOptions.vertex ?? {}),
      },
    };

    const { value: response } = await postJsonToApi({
      url: `${this.config.baseURL}/models/${this.modelId}:predict`,
      headers: combineHeaders(await resolve(this.config.headers), headers),
      body,
      failedResponseHandler: googleVertexFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        vertexImageResponseSchema,
      ),
      abortSignal: abortSignal,
      fetch: this.config.fetch,
    });

    return {
      images: response.predictions.map(
        (p: { bytesBase64Encoded: string }) => p.bytesBase64Encoded,
      ),
    };
  }
}

// minimal version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const vertexImageResponseSchema = z.object({
  predictions: z.array(z.object({ bytesBase64Encoded: z.string() })),
});
