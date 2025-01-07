import { ImageModelV1, UnsupportedFunctionalityError } from '@ai-sdk/provider';
import {
  Resolvable,
  combineHeaders,
  createJsonResponseHandler,
  postJsonToApi,
  resolve,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { googleVertexFailedResponseHandler } from './google-vertex-error';

export type GoogleVertexImageModelId =
  | 'imagen-3.0-generate-001'
  | 'imagen-3.0-fast-generate-001'
  | (string & {});

interface GoogleVertexImageModelConfig {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: typeof fetch;
}

// https://cloud.google.com/vertex-ai/generative-ai/docs/image/generate-images
export class GoogleVertexImageModel implements ImageModelV1 {
  readonly specificationVersion = 'v1';

  // https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/imagen-api#parameter_list
  readonly maxImagesPerCall = 4;

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
    aspectRatio,
    seed,
    providerOptions,
    headers,
    abortSignal,
  }: Parameters<ImageModelV1['doGenerate']>[0]): Promise<
    Awaited<ReturnType<ImageModelV1['doGenerate']>>
  > {
    if (size != null) {
      throw new UnsupportedFunctionalityError({
        functionality: 'image size',
        message:
          'This model does not support the `size` option. Use `aspectRatio` instead.',
      });
    }

    if (n > this.maxImagesPerCall) {
      throw new UnsupportedFunctionalityError({
        functionality: `generate more than ${this.maxImagesPerCall} images`,
        message: `This model does not support generating more than ${this.maxImagesPerCall} images at a time.`,
      });
    }

    const body = {
      instances: [{ prompt }],
      parameters: {
        sampleCount: n,
        ...(aspectRatio != null ? { aspectRatio } : {}),
        ...(seed != null ? { seed } : {}),
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
      abortSignal,
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
