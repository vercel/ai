import {
  InvalidResponseDataError,
  type ImageModelV4,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertImageModelFileToDataUri,
  createBinaryResponseHandler,
  createJsonResponseHandler,
  delay,
  getFromApi,
  parseProviderOptions,
  postJsonToApi,
  resolve,
  serializeModelOptions,
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
  type Resolvable,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { replicateFailedResponseHandler } from './replicate-error';
import { replicateImageModelOptionsSchema } from './replicate-image-model-options';
import type { ReplicateImageModelId } from './replicate-image-settings';

const DEFAULT_POLL_INTERVAL_MILLIS = 500;
const DEFAULT_MAX_POLL_ATTEMPTS = 240;

interface ReplicateImageModelConfig {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
}

// Flux-2 models support up to 8 input images with input_image, input_image_2, etc.
const FLUX_2_MODEL_PATTERN = /^black-forest-labs\/flux-2-/;
const MAX_FLUX_2_INPUT_IMAGES = 8;

// Retain the previous output batch limit for known legacy models. Future
// models inherit the current output limit independently of reference images.
const DEFAULT_MAX_IMAGES_PER_CALL = 8;
const legacySingleImageModelIds = new Set<ReplicateImageModelId>([
  'black-forest-labs/flux-1.1-pro',
  'black-forest-labs/flux-1.1-pro-ultra',
  'black-forest-labs/flux-dev',
  'black-forest-labs/flux-pro',
  'black-forest-labs/flux-schnell',
  'bytedance/sdxl-lightning-4step',
  'fofr/aura-flow',
  'fofr/latent-consistency-model',
  'fofr/realvisxl-v3-multi-controlnet-lora',
  'fofr/sdxl-emoji',
  'fofr/sdxl-multi-controlnet-lora',
  'ideogram-ai/ideogram-v2',
  'ideogram-ai/ideogram-v2-turbo',
  'lucataco/dreamshaper-xl-turbo',
  'lucataco/open-dalle-v1.1',
  'lucataco/realvisxl-v2.0',
  'lucataco/realvisxl2-lcm',
  'luma/photon',
  'luma/photon-flash',
  'nvidia/sana',
  'playgroundai/playground-v2.5-1024px-aesthetic',
  'recraft-ai/recraft-v3',
  'recraft-ai/recraft-v3-svg',
  'stability-ai/stable-diffusion-3.5-large',
  'stability-ai/stable-diffusion-3.5-large-turbo',
  'stability-ai/stable-diffusion-3.5-medium',
  'tstramer/material-diffusion',
  'black-forest-labs/flux-fill-pro',
  'black-forest-labs/flux-fill-dev',
]);

export class ReplicateImageModel implements ImageModelV4 {
  readonly specificationVersion = 'v4';

  get maxImagesPerCall(): number {
    const [modelId] = this.modelId.split(':');
    return legacySingleImageModelIds.has(modelId)
      ? 1
      : DEFAULT_MAX_IMAGES_PER_CALL;
  }

  get supportsFileInputs(): boolean | undefined {
    if (
      this.modelId === 'black-forest-labs/flux-2-pro' ||
      this.modelId === 'black-forest-labs/flux-2-dev' ||
      this.modelId === 'black-forest-labs/flux-fill-pro' ||
      this.modelId === 'black-forest-labs/flux-fill-dev'
    ) {
      return true;
    }

    return undefined;
  }

  get supportsMaskInputs(): boolean | undefined {
    if (
      this.modelId === 'black-forest-labs/flux-fill-pro' ||
      this.modelId === 'black-forest-labs/flux-fill-dev'
    ) {
      return true;
    }

    return this.supportsFileInputs === true ? false : undefined;
  }

  get provider(): string {
    return this.config.provider;
  }

  private get isFlux2Model(): boolean {
    return FLUX_2_MODEL_PATTERN.test(this.modelId);
  }

  static [WORKFLOW_SERIALIZE](model: ReplicateImageModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: ReplicateImageModelId;
    config: ReplicateImageModelConfig;
  }) {
    return new ReplicateImageModel(options.modelId, options.config);
  }

  constructor(
    readonly modelId: ReplicateImageModelId,
    private readonly config: ReplicateImageModelConfig,
  ) {}

  async doGenerate({
    prompt,
    n,
    aspectRatio,
    size,
    seed,
    providerOptions,
    headers,
    abortSignal,
    files,
    mask,
  }: Parameters<ImageModelV4['doGenerate']>[0]): Promise<
    Awaited<ReturnType<ImageModelV4['doGenerate']>>
  > {
    const warnings: Array<SharedV4Warning> = [];

    const [modelId, version] = this.modelId.split(':');

    const currentDate = this.config._internal?.currentDate?.() ?? new Date();

    // Parse provider options
    const replicateOptions = await parseProviderOptions({
      provider: 'replicate',
      providerOptions,
      schema: replicateImageModelOptionsSchema,
    });

    // Handle image input from files
    let imageInputs: Record<string, string> = {};
    if (files != null && files.length > 0) {
      if (this.isFlux2Model) {
        // Flux-2 models use input_image, input_image_2, input_image_3, etc.
        for (
          let i = 0;
          i < Math.min(files.length, MAX_FLUX_2_INPUT_IMAGES);
          i++
        ) {
          const key = i === 0 ? 'input_image' : `input_image_${i + 1}`;
          imageInputs[key] = convertImageModelFileToDataUri(files[i]);
        }
        if (files.length > MAX_FLUX_2_INPUT_IMAGES) {
          warnings.push({
            type: 'other',
            message: `Flux-2 models support up to ${MAX_FLUX_2_INPUT_IMAGES} input images. Additional images are ignored.`,
          });
        }
      } else {
        // Other models use single 'image' parameter
        imageInputs = { image: convertImageModelFileToDataUri(files[0]) };
        if (files.length > 1) {
          warnings.push({
            type: 'other',
            message:
              'This Replicate model only supports a single input image. Additional images are ignored.',
          });
        }
      }
    }

    // Handle mask input (not supported by Flux-2 models)
    let maskInput: string | undefined;
    if (mask != null) {
      if (this.isFlux2Model) {
        warnings.push({
          type: 'other',
          message:
            'Flux-2 models do not support mask input. The mask will be ignored.',
        });
      } else {
        maskInput = convertImageModelFileToDataUri(mask);
      }
    }

    // Extract maxWaitTimeInSeconds from provider options and prepare the rest for the request body
    const {
      maxWaitTimeInSeconds,
      pollIntervalMillis = DEFAULT_POLL_INTERVAL_MILLIS,
      maxPollAttempts = DEFAULT_MAX_POLL_ATTEMPTS,
      ...inputOptions
    } = replicateOptions ?? {};

    // Build the prefer header based on maxWaitTimeInSeconds:
    // - undefined/null: use default sync wait (prefer: wait)
    // - positive number: use custom wait duration (prefer: wait=N)
    const preferHeader: Record<string, string> =
      maxWaitTimeInSeconds != null
        ? { prefer: `wait=${maxWaitTimeInSeconds}` }
        : { prefer: 'wait' };

    const resolvedHeaders = this.config.headers
      ? await resolve(this.config.headers)
      : undefined;

    const { value: initialPrediction, responseHeaders } = await postJsonToApi({
      url:
        // different endpoints for versioned vs unversioned models:
        version != null
          ? `${this.config.baseURL}/predictions`
          : `${this.config.baseURL}/models/${modelId}/predictions`,

      headers: combineHeaders(resolvedHeaders, headers, preferHeader),

      body: {
        input: {
          prompt,
          aspect_ratio: aspectRatio,
          size,
          seed,
          num_outputs: n,
          ...imageInputs,
          ...(maskInput != null ? { mask: maskInput } : {}),
          ...inputOptions,
        },
        // for versioned models, include the version in the body:
        ...(version != null ? { version } : {}),
      },

      successfulResponseHandler: createJsonResponseHandler(
        replicateImageResponseSchema,
      ),
      failedResponseHandler: replicateFailedResponseHandler,
      abortSignal,
      fetch: this.config.fetch,
    });

    const prediction = await this.pollPrediction({
      prediction: initialPrediction,
      headers: combineHeaders(resolvedHeaders, headers),
      pollIntervalMillis: pollIntervalMillis ?? DEFAULT_POLL_INTERVAL_MILLIS,
      maxPollAttempts: maxPollAttempts ?? DEFAULT_MAX_POLL_ATTEMPTS,
      abortSignal,
    });

    if (prediction.output == null) {
      throw new InvalidResponseDataError({
        data: prediction,
        message: 'Replicate image generation completed without output.',
      });
    }

    // download the images:
    const outputArray = Array.isArray(prediction.output)
      ? prediction.output
      : [prediction.output];
    const images = await Promise.all(
      outputArray.map(async url => {
        const { value: image } = await getFromApi({
          url,
          // url is an output image URL from the provider response; validate it.
          validateUrl: true,
          trustedOrigin: this.config.baseURL,
          successfulResponseHandler: createBinaryResponseHandler(),
          failedResponseHandler: replicateFailedResponseHandler,
          abortSignal,
          fetch: this.config.fetch,
        });
        return image;
      }),
    );

    return {
      images,
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
    };
  }

  private async pollPrediction({
    prediction,
    headers,
    pollIntervalMillis,
    maxPollAttempts,
    abortSignal,
  }: {
    prediction: ReplicateImagePrediction;
    headers: Record<string, string | undefined>;
    pollIntervalMillis: number;
    maxPollAttempts: number;
    abortSignal: AbortSignal | undefined;
  }): Promise<ReplicateImagePrediction> {
    let currentPrediction = prediction;

    for (let i = 0; i < maxPollAttempts; i++) {
      const completedPrediction =
        this.getCompletedPrediction(currentPrediction);
      if (completedPrediction != null) {
        return completedPrediction;
      }

      const { value } = await getFromApi({
        url: currentPrediction.urls.get,
        validateUrl: true,
        credentialedOrigin: this.config.baseURL,
        trustedOrigin: this.config.baseURL,
        headers,
        successfulResponseHandler: createJsonResponseHandler(
          replicateImageResponseSchema,
        ),
        failedResponseHandler: replicateFailedResponseHandler,
        abortSignal,
        fetch: this.config.fetch,
      });
      currentPrediction = value;

      if (i < maxPollAttempts - 1) {
        await delay(pollIntervalMillis, { abortSignal });
      }
    }

    const completedPrediction = this.getCompletedPrediction(currentPrediction);
    if (completedPrediction != null) {
      return completedPrediction;
    }

    throw new Error(
      `Replicate image generation did not complete after ${maxPollAttempts} polling attempts.`,
    );
  }

  private getCompletedPrediction(
    prediction: ReplicateImagePrediction,
  ): ReplicateImagePrediction | undefined {
    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      throw new InvalidResponseDataError({
        data: prediction,
        message: `Replicate image generation ${prediction.status}: ${prediction.error ?? 'Unknown error'}`,
      });
    }

    if (prediction.output != null || prediction.status === 'succeeded') {
      return prediction;
    }
  }
}

const replicateImageResponseSchema = z.object({
  status: z.enum(['starting', 'processing', 'succeeded', 'failed', 'canceled']),
  output: z.union([z.array(z.string()), z.string()]).nullish(),
  error: z.string().nullish(),
  urls: z.object({
    get: z.string(),
  }),
});

type ReplicateImagePrediction = z.infer<typeof replicateImageResponseSchema>;
