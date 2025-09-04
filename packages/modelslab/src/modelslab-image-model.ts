import type {
  ImageModelV2,
  ImageModelV2CallWarning,
  ImageModelV2CallOptions,
} from '@ai-sdk/provider';
import type { Resolvable } from '@ai-sdk/provider-utils';
import {
  FetchFunction,
  combineHeaders,
  createJsonResponseHandler,
  createJsonErrorResponseHandler,
  postJsonToApi,
  resolve,
  loadApiKey,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import {
  ModelslabImageModelId,
  ModelslabImageSettings,
} from './modelslab-image-settings';

interface ModelslabImageModelConfig {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  apiKey?: string;
  _internal?: {
    currentDate?: () => Date;
  };
}

export class ModelslabImageModel implements ImageModelV2 {
  readonly specificationVersion = 'v2';
  readonly maxImagesPerCall = 4;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: ModelslabImageModelId,
    private readonly config: ModelslabImageModelConfig,
  ) {}

  private getApiKey(): string {
    return loadApiKey({
      apiKey: this.config.apiKey,
      environmentVariableName: 'MODELSLAB_API_KEY',
      description: 'ModelsLab',
    });
  }

  async doGenerate(
    options: ImageModelV2CallOptions,
  ): Promise<Awaited<ReturnType<ImageModelV2['doGenerate']>>> {
    const { prompt, n, size, seed, providerOptions, headers, abortSignal } =
      options;
    const warnings: Array<ImageModelV2CallWarning> = [];

    // Parse size if provided
    let width = 512;
    let height = 512;
    if (size) {
      const [w, h] = size.split('x').map(Number);
      if (w && h) {
        width = w;
        height = h;
      }
    }

    // Get provider-specific options
    const modelslabOptions =
      (providerOptions?.modelslab as Partial<ModelslabImageSettings>) || {};

    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { value, responseHeaders } = await postJsonToApi({
      url: `${this.config.baseURL}/api/v6/realtime/text2img`,
      headers: combineHeaders(await resolve(this.config.headers), headers),
      body: {
        key: this.getApiKey(),
        prompt: prompt,
        negative_prompt: modelslabOptions.negativePrompt || 'bad quality',
        width: modelslabOptions.width || width,
        height: modelslabOptions.height || height,
        samples: modelslabOptions.samples || n || 1,
        safety_checker: modelslabOptions.safetyChecker ?? true,
        seed:
          modelslabOptions.seed !== undefined ? modelslabOptions.seed : seed,
        instant_response: modelslabOptions.instantResponse || false,
        base64: modelslabOptions.base64 || false,
        webhook: modelslabOptions.webhook || null,
        track_id: modelslabOptions.trackId || null,
        enhance_prompt: modelslabOptions.enhancePrompt || false,
      },
      failedResponseHandler: modelslabFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        z.any(), // Simplified to avoid deep type instantiation
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    // Check if response has error status
    if ((value as any).status !== 'success') {
      throw new Error(`ModelsLab API error: ${(value as any).status}`);
    }

    // For now, we'll return empty Uint8Array as placeholder since we're returning URLs in metadata
    // In the future, we could download the images and return them as Uint8Array
    const images = (value as any).output.map(() => new Uint8Array(0));

    return {
      images,
      warnings,
      response: {
        modelId: this.modelId,
        timestamp: currentDate,
        headers: responseHeaders,
      },
      providerMetadata: {
        modelslab: {
          images: (value as any).output.map((url: string) => ({ url })),
          id: (value as any).id,
          ...((value as any).generationTime && {
            generationTime: (value as any).generationTime,
          }),
          ...((value as any).meta && { meta: (value as any).meta }),
        },
      } as any,
    };
  }
}

// Simplified schemas to avoid deep type instantiation issues
const modelslabErrorSchema = z.object({
  status: z.string(),
  message: z.string().optional(),
  error: z.string().optional(),
});

const modelslabFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: modelslabErrorSchema,
  errorToMessage: (error: any) => {
    return error.message || error.error || 'Unknown ModelsLab error';
  },
});
