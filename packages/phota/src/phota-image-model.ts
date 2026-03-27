import type { ImageModelV4, SharedV4Warning } from '@ai-sdk/provider';
import type { InferSchema, Resolvable } from '@ai-sdk/provider-utils';
import {
  FetchFunction,
  combineHeaders,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  getFromApi,
  lazySchema,
  parseProviderOptions,
  postJsonToApi,
  resolve,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { PhotaImageModelId } from './phota-image-settings';

interface PhotaImageModelConfig {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
}

// Minimal 1x1 transparent PNG in base64, used as a placeholder for
// non-image operations (train, status) so generateImage does not throw.
const PLACEHOLDER_IMAGE =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAABJRUEFTkSuQmCC';

export class PhotaImageModel implements ImageModelV4 {
  readonly specificationVersion = 'v4';
  readonly maxImagesPerCall: number = 1;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: PhotaImageModelId,
    private readonly config: PhotaImageModelConfig,
  ) {}

  async doGenerate(
    options: Parameters<ImageModelV4['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<ImageModelV4['doGenerate']>>> {
    if (this.modelId === 'train') {
      return this.doTrain(options);
    }
    if (this.modelId === 'status') {
      return this.doStatus(options);
    }
    return this.doImageOperation(options);
  }

  private async doTrain({
    files,
    headers,
    abortSignal,
  }: Parameters<ImageModelV4['doGenerate']>[0]): Promise<
    Awaited<ReturnType<ImageModelV4['doGenerate']>>
  > {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const combinedHeaders = combineHeaders(
      await resolve(this.config.headers),
      headers,
    );

    const imageUrls =
      files?.map(file => {
        if (file.type === 'url') {
          return file.url;
        }
        throw new Error(
          'Phota profile training requires publicly accessible image URLs.',
        );
      }) ?? [];

    const { value, responseHeaders } = await postJsonToApi({
      url: `${this.config.baseURL}/profiles/add`,
      headers: combinedHeaders,
      body: { image_urls: imageUrls },
      failedResponseHandler: photaFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        photaTrainResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      images: [PLACEHOLDER_IMAGE],
      warnings: [],
      providerMetadata: {
        phota: {
          images: [{ profileId: value.profile_id }],
        },
      },
      response: {
        modelId: this.modelId,
        timestamp: currentDate,
        headers: responseHeaders,
      },
    };
  }

  private async doStatus({
    providerOptions,
    headers,
    abortSignal,
  }: Parameters<ImageModelV4['doGenerate']>[0]): Promise<
    Awaited<ReturnType<ImageModelV4['doGenerate']>>
  > {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const combinedHeaders = combineHeaders(
      await resolve(this.config.headers),
      headers,
    );

    const photaOptions = await parseProviderOptions({
      provider: 'phota',
      providerOptions,
      schema: photaImageModelOptionsSchema,
    });

    const profileId = photaOptions?.profileId;
    if (!profileId) {
      throw new Error(
        'Phota status requires a profileId in providerOptions.phota.',
      );
    }

    const { value, responseHeaders } = await getFromApi({
      url: `${this.config.baseURL}/profiles/${encodeURIComponent(profileId)}/status`,
      headers: combinedHeaders,
      failedResponseHandler: photaFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        photaStatusResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      images: [PLACEHOLDER_IMAGE],
      warnings: [],
      providerMetadata: {
        phota: {
          images: [
            {
              profileId: value.profile_id,
              status: value.status,
              ...(value.message != null && { message: value.message }),
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

  private async doImageOperation({
    prompt,
    files,
    n,
    aspectRatio,
    size,
    providerOptions,
    headers,
    abortSignal,
  }: Parameters<ImageModelV4['doGenerate']>[0]): Promise<
    Awaited<ReturnType<ImageModelV4['doGenerate']>>
  > {
    const warnings: Array<SharedV4Warning> = [];
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const combinedHeaders = combineHeaders(
      await resolve(this.config.headers),
      headers,
    );

    const photaOptions = await parseProviderOptions({
      provider: 'phota',
      providerOptions,
      schema: photaImageModelOptionsSchema,
    });

    if (size) {
      warnings.push({
        type: 'unsupported',
        feature: 'size',
        details: 'Phota does not support size. Use aspectRatio instead.',
      });
    }

    const body: Record<string, unknown> = {};

    if (this.modelId === 'generate') {
      body.prompt = prompt;
      if (photaOptions?.proMode != null) body.pro_mode = photaOptions.proMode;
      if (n != null) body.num_output_images = n;
      if (aspectRatio != null) body.aspect_ratio = aspectRatio;
      if (photaOptions?.resolution != null)
        body.resolution = photaOptions.resolution;
    } else if (this.modelId === 'edit') {
      body.prompt = prompt;
      body.images = this.filesToStrings(files);
      if (photaOptions?.profileIds != null)
        body.profile_ids = photaOptions.profileIds;
      if (photaOptions?.proMode != null) body.pro_mode = photaOptions.proMode;
      if (n != null) body.num_output_images = n;
      if (aspectRatio != null) body.aspect_ratio = aspectRatio;
      if (photaOptions?.resolution != null)
        body.resolution = photaOptions.resolution;
    } else if (this.modelId === 'enhance') {
      const inputImages = this.filesToStrings(files);
      if (inputImages.length > 0) {
        body.image = inputImages[0];
      }
      if (photaOptions?.profileIds != null)
        body.profile_ids = photaOptions.profileIds;
      if (photaOptions?.proMode != null) body.pro_mode = photaOptions.proMode;
      if (n != null) body.num_output_images = n;
    } else {
      // Custom/unknown model ID — pass through all params
      body.prompt = prompt;
      const inputImages = this.filesToStrings(files);
      if (inputImages.length > 0) body.images = inputImages;
      if (photaOptions?.profileIds != null)
        body.profile_ids = photaOptions.profileIds;
      if (photaOptions?.proMode != null) body.pro_mode = photaOptions.proMode;
      if (n != null) body.num_output_images = n;
      if (aspectRatio != null) body.aspect_ratio = aspectRatio;
      if (photaOptions?.resolution != null)
        body.resolution = photaOptions.resolution;
    }

    const { value, responseHeaders } = await postJsonToApi({
      url: `${this.config.baseURL}/${this.modelId}`,
      headers: combinedHeaders,
      body,
      failedResponseHandler: photaFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        photaImageResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      images: value.images,
      warnings,
      providerMetadata: {
        phota: {
          images: value.images.map(() => ({
            ...(value.known_subjects != null && {
              knownSubjects: value.known_subjects,
            }),
          })),
        },
      },
      response: {
        modelId: this.modelId,
        timestamp: currentDate,
        headers: responseHeaders,
      },
    };
  }

  private filesToStrings(
    files: Parameters<ImageModelV4['doGenerate']>[0]['files'],
  ): string[] {
    return (
      files?.map(file => {
        if (file.type === 'url') {
          return file.url;
        }
        if (typeof file.data === 'string') {
          return file.data;
        }
        return Buffer.from(file.data).toString('base64');
      }) ?? []
    );
  }
}

// Provider options schema
export const photaImageModelOptionsSchema = lazySchema(() =>
  zodSchema(
    z.object({
      /**
       * Profile ID for polling training status (used with the `status` model).
       */
      profileId: z.string().optional(),

      /**
       * Profile IDs for identity preservation in edit/enhance operations.
       */
      profileIds: z.array(z.string()).optional(),

      /**
       * Enable pro mode for better instruction following at higher latency/cost.
       * Required to use non-default aspect ratios or 4K resolution.
       */
      proMode: z.boolean().optional(),

      /**
       * Output resolution. Must be '1K' when pro_mode is disabled.
       */
      resolution: z.enum(['1K', '4K']).optional(),
    }),
  ),
);

export type PhotaImageModelOptions = InferSchema<
  typeof photaImageModelOptionsSchema
>;

// Response schemas
const photaImageResponseSchema = z.object({
  images: z.array(z.string()),
  known_subjects: z
    .object({
      counts: z.record(z.string(), z.number()),
    })
    .nullish(),
});

const photaTrainResponseSchema = z.object({
  profile_id: z.string(),
});

const photaStatusResponseSchema = z.object({
  profile_id: z.string(),
  status: z.string(),
  message: z.string().nullish(),
});

// Error handling
const photaErrorSchema = z.object({
  message: z.string().optional(),
  detail: z.any().optional(),
});

const photaFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: photaErrorSchema,
  errorToMessage: error => {
    if (typeof error.detail === 'string') return error.detail;
    if (error.detail != null) {
      try {
        return JSON.stringify(error.detail);
      } catch {
        // ignore
      }
    }
    return error.message ?? 'Unknown Phota error';
  },
});
