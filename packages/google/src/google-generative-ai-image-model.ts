import { ImageModelV3, SharedV3Warning } from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonResponseHandler,
  type InferSchema,
  lazySchema,
  parseProviderOptions,
  postJsonToApi,
  resolve,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { googleFailedResponseHandler } from './google-error';
import {
  GoogleGenerativeAIImageModelId,
  GoogleGenerativeAIImageSettings,
} from './google-generative-ai-image-settings';
import { FetchFunction, Resolvable } from '@ai-sdk/provider-utils';

interface GoogleGenerativeAIImageModelConfig {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  generateId?: () => string;
  _internal?: {
    currentDate?: () => Date;
  };
}

export class GoogleGenerativeAIImageModel implements ImageModelV3 {
  readonly specificationVersion = 'v3';

  get maxImagesPerCall(): number {
    // https://ai.google.dev/gemini-api/docs/imagen#imagen-model
    return this.settings.maxImagesPerCall ?? 4;
  }

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: GoogleGenerativeAIImageModelId,
    private readonly settings: GoogleGenerativeAIImageSettings,
    private readonly config: GoogleGenerativeAIImageModelConfig,
  ) {}

  async doGenerate(
    options: Parameters<ImageModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<ImageModelV3['doGenerate']>>> {
    const {
      prompt,
      n = 1,
      size,
      aspectRatio = '1:1',
      seed,
      providerOptions,
      headers,
      abortSignal,
      files,
      mask,
    } = options;
    const warnings: Array<SharedV3Warning> = [];

    // Google Generative AI does not support image editing
    if (files != null && files.length > 0) {
      throw new Error(
        'Google Generative AI does not support image editing. ' +
          'Use Google Vertex AI (@ai-sdk/google-vertex) for image editing capabilities.',
      );
    }

    if (mask != null) {
      throw new Error(
        'Google Generative AI does not support image editing with masks. ' +
          'Use Google Vertex AI (@ai-sdk/google-vertex) for image editing capabilities.',
      );
    }

    if (size != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'size',
        details:
          'This model does not support the `size` option. Use `aspectRatio` instead.',
      });
    }

    if (seed != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'seed',
        details:
          'This model does not support the `seed` option through this provider.',
      });
    }

    const googleOptions = await parseProviderOptions({
      provider: 'google',
      providerOptions,
      schema: googleImageProviderOptionsSchema,
    });

    const currentDate = this.config._internal?.currentDate?.() ?? new Date();

    const parameters: Record<string, unknown> = {
      sampleCount: n,
    };

    if (aspectRatio != null) {
      parameters.aspectRatio = aspectRatio;
    }

    if (googleOptions) {
      Object.assign(parameters, googleOptions);
    }

    const body = {
      instances: [{ prompt }],
      parameters,
    };

    const { responseHeaders, value: response } = await postJsonToApi<{
      predictions: Array<{ bytesBase64Encoded: string }>;
    }>({
      url: `${this.config.baseURL}/models/${this.modelId}:predict`,
      headers: combineHeaders(await resolve(this.config.headers), headers),
      body,
      failedResponseHandler: googleFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        googleImageResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });
    return {
      images: response.predictions.map(
        (p: { bytesBase64Encoded: string }) => p.bytesBase64Encoded,
      ),
      warnings: warnings ?? [],
      providerMetadata: {
        google: {
          images: response.predictions.map(prediction => ({
            // Add any prediction-specific metadata here
          })),
        },
      },
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
    };
  }
}

// minimal version of the schema
const googleImageResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      predictions: z
        .array(z.object({ bytesBase64Encoded: z.string() }))
        .default([]),
    }),
  ),
);

// Note: For the initial GA launch of Imagen 3, safety filters are not configurable.
// https://ai.google.dev/gemini-api/docs/imagen#imagen-model
const googleImageProviderOptionsSchema = lazySchema(() =>
  zodSchema(
    z.object({
      personGeneration: z
        .enum(['dont_allow', 'allow_adult', 'allow_all'])
        .nullish(),
      aspectRatio: z.enum(['1:1', '3:4', '4:3', '9:16', '16:9']).nullish(),
    }),
  ),
);

export type GoogleGenerativeAIImageProviderOptions = InferSchema<
  typeof googleImageProviderOptionsSchema
>;
