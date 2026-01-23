import type { ImageModelV3, SharedV3Warning } from '@ai-sdk/provider';
import type { InferSchema, Resolvable } from '@ai-sdk/provider-utils';
import {
  combineHeaders,
  createJsonErrorResponseHandler,
  type FetchFunction,
  lazySchema,
  parseProviderOptions,
  postToApi,
  resolve,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { ProdiaImageModelId } from './prodia-image-settings';

export class ProdiaImageModel implements ImageModelV3 {
  readonly specificationVersion = 'v3';
  readonly maxImagesPerCall = 1;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: ProdiaImageModelId,
    private readonly config: ProdiaImageModelConfig,
  ) {}

  private async getArgs({
    prompt,
    size,
    seed,
    providerOptions,
  }: Parameters<ImageModelV3['doGenerate']>[0]) {
    const warnings: Array<SharedV3Warning> = [];

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
          type: 'unsupported',
          feature: 'size',
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
    options: Parameters<ImageModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<ImageModelV3['doGenerate']>>> {
    const { body, warnings } = await this.getArgs(options);

    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const combinedHeaders = combineHeaders(
      await resolve(this.config.headers),
      options.headers,
    );

    const { value: multipartResult, responseHeaders } = await postToApi({
      url: `${this.config.baseURL}/job`,
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
          images: [
            {
              jobId: jobResult.id,
              ...(jobResult.config?.seed != null && {
                seed: jobResult.config.seed,
              }),
              ...(jobResult.metrics?.elapsed != null && {
                elapsed: jobResult.metrics.elapsed,
              }),
              ...(jobResult.metrics?.ips != null && {
                iterationsPerSecond: jobResult.metrics.ips,
              }),
              ...(jobResult.created_at != null && {
                createdAt: jobResult.created_at,
              }),
              ...(jobResult.updated_at != null && {
                updatedAt: jobResult.updated_at,
              }),
            },
          ],
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

interface ProdiaImageModelConfig {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
}

const prodiaJobResultSchema = z.object({
  id: z.string(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  expires_at: z.string().optional(),
  state: z
    .object({
      current: z.string(),
    })
    .optional(),
  config: z
    .object({
      seed: z.number().optional(),
    })
    .passthrough()
    .optional(),
  metrics: z
    .object({
      elapsed: z.number().optional(),
      ips: z.number().optional(),
    })
    .optional(),
});

type ProdiaJobResult = z.infer<typeof prodiaJobResultSchema>;

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
        jobResult = prodiaJobResultSchema.parse(JSON.parse(jsonStr));
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

interface MultipartPart {
  headers: Record<string, string>;
  body: Uint8Array;
}

function parseMultipart(data: Uint8Array, boundary: string): MultipartPart[] {
  const parts: MultipartPart[] = [];
  const boundaryBytes = new TextEncoder().encode(`--${boundary}`);
  const endBoundaryBytes = new TextEncoder().encode(`--${boundary}--`);

  const positions: number[] = [];
  for (let i = 0; i <= data.length - boundaryBytes.length; i++) {
    let match = true;
    for (let j = 0; j < boundaryBytes.length; j++) {
      if (data[i + j] !== boundaryBytes[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      positions.push(i);
    }
  }

  for (let i = 0; i < positions.length - 1; i++) {
    const start = positions[i] + boundaryBytes.length;
    const end = positions[i + 1];

    let isEndBoundary = true;
    for (let j = 0; j < endBoundaryBytes.length && isEndBoundary; j++) {
      if (data[positions[i] + j] !== endBoundaryBytes[j]) {
        isEndBoundary = false;
      }
    }
    if (
      isEndBoundary &&
      positions[i] + endBoundaryBytes.length <= data.length
    ) {
      continue;
    }

    let partStart = start;
    if (data[partStart] === 0x0d && data[partStart + 1] === 0x0a) {
      partStart += 2;
    } else if (data[partStart] === 0x0a) {
      partStart += 1;
    }

    let partEnd = end;
    if (data[partEnd - 2] === 0x0d && data[partEnd - 1] === 0x0a) {
      partEnd -= 2;
    } else if (data[partEnd - 1] === 0x0a) {
      partEnd -= 1;
    }

    const partData = data.slice(partStart, partEnd);

    let headerEnd = -1;
    for (let j = 0; j < partData.length - 3; j++) {
      if (
        partData[j] === 0x0d &&
        partData[j + 1] === 0x0a &&
        partData[j + 2] === 0x0d &&
        partData[j + 3] === 0x0a
      ) {
        headerEnd = j;
        break;
      }
      if (partData[j] === 0x0a && partData[j + 1] === 0x0a) {
        headerEnd = j;
        break;
      }
    }

    if (headerEnd === -1) {
      continue;
    }

    const headerBytes = partData.slice(0, headerEnd);
    const headerStr = new TextDecoder().decode(headerBytes);
    const headers: Record<string, string> = {};
    for (const line of headerStr.split(/\r?\n/)) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim().toLowerCase();
        const value = line.slice(colonIdx + 1).trim();
        headers[key] = value;
      }
    }

    let bodyStart = headerEnd + 2;
    if (partData[headerEnd] === 0x0d) {
      bodyStart = headerEnd + 4;
    }
    const body = partData.slice(bodyStart);

    parts.push({ headers, body });
  }

  return parts;
}

const prodiaErrorSchema = z.object({
  message: z.string().optional(),
  detail: z.unknown().optional(),
  error: z.string().optional(),
});

const prodiaFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: prodiaErrorSchema,
  errorToMessage: error => {
    const parsed = prodiaErrorSchema.safeParse(error);
    if (!parsed.success) return 'Unknown Prodia error';
    const { message, detail, error: errorField } = parsed.data;
    if (typeof detail === 'string') return detail;
    if (detail != null) {
      try {
        return JSON.stringify(detail);
      } catch {
        // ignore
      }
    }
    return errorField ?? message ?? 'Unknown Prodia error';
  },
});
