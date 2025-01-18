import { ImageModelResponseMetadata, NoImageGeneratedError } from 'ai';
import { ImageModelV1, ImageModelV1CallWarning } from '@ai-sdk/provider';
import {
  Resolvable,
  combineHeaders,
  createJsonResponseHandler,
  generateId,
  postJsonToApi,
  resolve,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { googleVertexFailedResponseHandler } from './google-vertex-error';
import {
  GoogleVertexImageModelId,
  GoogleVertexImageSettings,
} from './google-vertex-image-settings';

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

  get maxImagesPerCall(): number {
    // https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/imagen-api#parameter_list
    return this.settings.maxImagesPerCall ?? 4;
  }

  constructor(
    readonly modelId: GoogleVertexImageModelId,
    readonly settings: GoogleVertexImageSettings,
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
    const warnings: Array<ImageModelV1CallWarning> = [];

    if (size != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'size',
        details:
          'This model does not support the `size` option. Use `aspectRatio` instead.',
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

    const url = `${this.config.baseURL}/models/${this.modelId}:predict`;
    const currentDate = this.settings._internal?.currentDate?.() ?? new Date();
    const { value: response, responseHeaders } = await postJsonToApi({
      url,
      headers: combineHeaders(await resolve(this.config.headers), headers),
      body,
      failedResponseHandler: googleVertexFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        vertexImageResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    if (!response.predictions) {
      const response: ImageModelResponseMetadata = {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      };
      throw new NoImageGeneratedError({
        response,
      });
    }

    return {
      images:
        response.predictions.map(
          (p: { bytesBase64Encoded: string }) => p.bytesBase64Encoded,
        ) ?? [],
      warnings,
    };
  }
}

// minimal version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const vertexImageResponseSchema = z.object({
  predictions: z.array(z.object({ bytesBase64Encoded: z.string() })).optional(),
});
