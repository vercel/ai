import type { ImageModelV2, ImageModelV2CallWarning } from '@ai-sdk/provider';
import type { InferSchema } from '@ai-sdk/provider-utils';
import {
  combineHeaders,
  lazySchema,
  parseJSON,
  parseProviderOptions,
  postToApi,
  resolve,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { ProdiaModelConfig } from './prodia-api';
import {
  buildProdiaProviderMetadata,
  parseMultipart,
  prodiaFailedResponseHandler,
  prodiaJobResultSchema,
} from './prodia-api';
import type { ProdiaJobResult } from './prodia-api';
import type { ProdiaImageModelId } from './prodia-image-settings';

export class ProdiaImageModel implements ImageModelV2 {
  readonly specificationVersion = 'v2';
  readonly maxImagesPerCall = 1;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: ProdiaImageModelId,
    private readonly config: ProdiaModelConfig,
  ) {}

  private async getArgs({
    prompt,
    size,
    seed,
    providerOptions,
  }: Parameters<ImageModelV2['doGenerate']>[0]) {
    const warnings: Array<ImageModelV2CallWarning> = [];

    const prodiaOptions = await parseProviderOptions({
      provider: 'prodia',
      providerOptions,
      schema: prodiaImageProviderOptionsSchema,
    });

    let width: number | undefined;
    let height: number | undefined;
    if (size) {
      const [widthStr, heightStr] = size.split('x');
      width = Number(widthStr);
      height = Number(heightStr);
      if (
        !widthStr ||
        !heightStr ||
        !Number.isFinite(width) ||
        !Number.isFinite(height)
      ) {
        warnings.push({
          type: 'unsupported-setting',
          setting: 'size',
          details: `Invalid size format: ${size}. Expected format: WIDTHxHEIGHT (e.g., 1024x1024)`,
        });
        width = undefined;
        height = undefined;
      }
    }

    const jobConfig: Record<string, unknown> = {
      prompt,
    };

    if (prodiaOptions?.width !== undefined) {
      jobConfig.width = prodiaOptions.width;
    } else if (width !== undefined) {
      jobConfig.width = width;
    }

    if (prodiaOptions?.height !== undefined) {
      jobConfig.height = prodiaOptions.height;
    } else if (height !== undefined) {
      jobConfig.height = height;
    }

    if (seed !== undefined) {
      jobConfig.seed = seed;
    }
    if (prodiaOptions?.steps !== undefined) {
      jobConfig.steps = prodiaOptions.steps;
    }
    if (prodiaOptions?.stylePreset !== undefined) {
      jobConfig.style_preset = prodiaOptions.stylePreset;
    }
    if (prodiaOptions?.loras !== undefined && prodiaOptions.loras.length > 0) {
      jobConfig.loras = prodiaOptions.loras;
    }
    if (prodiaOptions?.progressive !== undefined) {
      jobConfig.progressive = prodiaOptions.progressive;
    }

    const body = {
      type: this.modelId,
      config: jobConfig,
    };

    return { body, warnings };
  }

  async doGenerate(
    options: Parameters<ImageModelV2['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<ImageModelV2['doGenerate']>>> {
    const { body, warnings } = await this.getArgs(options);

    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const combinedHeaders = combineHeaders(
      await resolve(this.config.headers),
      options.headers,
    );

    const { value: multipartResult, responseHeaders } = await postToApi({
      url: `${this.config.baseURL}/job?price=true`,
      headers: {
        ...combinedHeaders,
        Accept: 'multipart/form-data; image/png',
        'Content-Type': 'application/json',
      },
      body: {
        content: JSON.stringify(body),
        values: body,
      },
      failedResponseHandler: prodiaFailedResponseHandler,
      successfulResponseHandler: createMultipartResponseHandler(),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const { jobResult, imageBytes } = multipartResult;

    return {
      images: [imageBytes],
      warnings,
      providerMetadata: {
        prodia: {
          images: [buildProdiaProviderMetadata(jobResult)],
        },
      },
      response: {
        modelId: this.modelId,
        timestamp: currentDate,
        headers: responseHeaders,
      },
    };
  }
}

const stylePresets = [
  '3d-model',
  'analog-film',
  'anime',
  'cinematic',
  'comic-book',
  'digital-art',
  'enhance',
  'fantasy-art',
  'isometric',
  'line-art',
  'low-poly',
  'neon-punk',
  'origami',
  'photographic',
  'pixel-art',
  'texture',
  'craft-clay',
] as const;

export const prodiaImageProviderOptionsSchema = lazySchema(() =>
  zodSchema(
    z.object({
      /**
       * Amount of computational iterations to run. More is typically higher quality.
       */
      steps: z.number().int().min(1).max(4).optional(),
      /**
       * Width of the output image in pixels.
       */
      width: z.number().int().min(256).max(1920).optional(),
      /**
       * Height of the output image in pixels.
       */
      height: z.number().int().min(256).max(1920).optional(),
      /**
       * Apply a visual theme to your output image.
       */
      stylePreset: z.enum(stylePresets).optional(),
      /**
       * Augment the output with a LoRa model.
       */
      loras: z.array(z.string()).max(3).optional(),
      /**
       * When using JPEG output, return a progressive JPEG.
       */
      progressive: z.boolean().optional(),
    }),
  ),
);

export type ProdiaImageProviderOptions = InferSchema<
  typeof prodiaImageProviderOptionsSchema
>;

interface MultipartResult {
  jobResult: ProdiaJobResult;
  imageBytes: Uint8Array;
}

function createMultipartResponseHandler() {
  return async ({
    response,
  }: {
    response: Response;
  }): Promise<{
    value: MultipartResult;
    responseHeaders: Record<string, string>;
  }> => {
    const contentType = response.headers.get('content-type') ?? '';
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    const boundaryMatch = contentType.match(/boundary=([^\s;]+)/);
    if (!boundaryMatch) {
      throw new Error(
        `Prodia response missing multipart boundary in content-type: ${contentType}`,
      );
    }
    const boundary = boundaryMatch[1];

    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    const parts = parseMultipart(bytes, boundary);

    let jobResult: ProdiaJobResult | undefined;
    let imageBytes: Uint8Array | undefined;

    for (const part of parts) {
      const contentDisposition = part.headers['content-disposition'] ?? '';
      const partContentType = part.headers['content-type'] ?? '';

      if (contentDisposition.includes('name="job"')) {
        const jsonStr = new TextDecoder().decode(part.body);
        jobResult = await parseJSON({
          text: jsonStr,
          schema: zodSchema(prodiaJobResultSchema),
        });
      } else if (contentDisposition.includes('name="output"')) {
        imageBytes = part.body;
      } else if (partContentType.startsWith('image/')) {
        imageBytes = part.body;
      }
    }

    if (!jobResult) {
      throw new Error('Prodia multipart response missing job part');
    }
    if (!imageBytes) {
      throw new Error('Prodia multipart response missing output image');
    }

    return {
      value: { jobResult, imageBytes },
      responseHeaders,
    };
  };
}
