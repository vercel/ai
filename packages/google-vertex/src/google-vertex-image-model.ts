import { ImageModelV1, ImageModelV1CallWarning } from '@ai-sdk/provider';
import {
  Resolvable,
  combineHeaders,
  createJsonResponseHandler,
  parseProviderOptions,
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
  _internal?: {
    currentDate?: () => Date;
  };
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

    const vertexImageOptions = parseProviderOptions({
      provider: 'vertex',
      providerOptions,
      schema: vertexImageProviderOptionsSchema,
    });

    const body = {
      instances: [{ prompt }],
      parameters: {
        sampleCount: n,
        ...(aspectRatio != null ? { aspectRatio } : {}),
        ...(seed != null ? { seed } : {}),
        ...(vertexImageOptions ?? {}),
      },
    };

    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { value: response, responseHeaders } = await postJsonToApi({
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
      images:
        response.predictions?.map(
          (p: { bytesBase64Encoded: string }) => p.bytesBase64Encoded,
        ) ?? [],
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
    };
  }
}

// minimal version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const vertexImageResponseSchema = z.object({
  predictions: z.array(z.object({ bytesBase64Encoded: z.string() })).nullish(),
});

const vertexImageProviderOptionsSchema = z.object({
  negativePrompt: z.string().nullish(),
  personGeneration: z
    .enum(['dont_allow', 'allow_adult', 'allow_all'])
    .nullish(),
  safetySetting: z
    .enum([
      'block_low_and_above',
      'block_medium_and_above',
      'block_only_high',
      'block_none',
    ])
    .nullish(),
  addWatermark: z.boolean().nullish(),
  storageUri: z.string().nullish(),
});
export type GoogleVertexImageProviderOptions = z.infer<
  typeof vertexImageProviderOptionsSchema
>;
