import type { ImageModelV3, SharedV3Warning } from '@ai-sdk/provider';
import type { InferSchema, Resolvable } from '@ai-sdk/provider-utils';
import {
  FetchFunction,
  combineHeaders,
  createBinaryResponseHandler,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  createStatusCodeErrorResponseHandler,
  delay,
  getFromApi,
  lazySchema,
  parseProviderOptions,
  postJsonToApi,
  resolve,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { BlackForestLabsAspectRatio } from './black-forest-labs-image-settings';
import { BlackForestLabsImageModelId } from './black-forest-labs-image-settings';

const DEFAULT_POLL_INTERVAL_MILLIS = 500;
const DEFAULT_POLL_TIMEOUT_MILLIS = 60000;

interface BlackForestLabsImageModelConfig {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  /**
   Poll interval in milliseconds between status checks. Defaults to 500ms.
   */
  pollIntervalMillis?: number;
  /**
   Overall timeout in milliseconds for polling before giving up. Defaults to 60s.
   */
  pollTimeoutMillis?: number;
  _internal?: {
    currentDate?: () => Date;
  };
}

export class BlackForestLabsImageModel implements ImageModelV3 {
  readonly specificationVersion = 'v3';
  readonly maxImagesPerCall = 1;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: BlackForestLabsImageModelId,
    private readonly config: BlackForestLabsImageModelConfig,
  ) {}

  private async getArgs({
    prompt,
    files,
    mask,
    size,
    aspectRatio,
    seed,
    providerOptions,
  }: Parameters<ImageModelV3['doGenerate']>[0]) {
    const warnings: Array<SharedV3Warning> = [];

    const finalAspectRatio =
      aspectRatio ?? (size ? convertSizeToAspectRatio(size) : undefined);

    if (size && !aspectRatio) {
      warnings.push({
        type: 'unsupported',
        feature: 'size',
        details:
          'Deriving aspect_ratio from size. Use the width and height provider options to specify dimensions for models that support them.',
      });
    } else if (size && aspectRatio) {
      warnings.push({
        type: 'unsupported',
        feature: 'size',
        details:
          'Black Forest Labs ignores size when aspectRatio is provided. Use the width and height provider options to specify dimensions for models that support them',
      });
    }

    const bflOptions = await parseProviderOptions({
      provider: 'blackForestLabs',
      providerOptions,
      schema: blackForestLabsImageProviderOptionsSchema,
    });

    const [widthStr, heightStr] = size?.split('x') ?? [];

    const inputImages: string[] =
      files?.map(file => {
        if (file.type === 'url') {
          return file.url;
        }

        if (typeof file.data === 'string') {
          return file.data;
        }

        return Buffer.from(file.data).toString('base64');
      }) || [];

    if (inputImages.length > 10) {
      throw new Error('Black Forest Labs supports up to 10 input images.');
    }

    const inputImagesObj: Record<string, string> = inputImages.reduce<
      Record<string, string>
    >((acc, img, index) => {
      acc[`input_image${index === 0 ? '' : `_${index + 1}`}`] = img;
      return acc;
    }, {});

    let maskValue: string | undefined;
    if (mask) {
      if (mask.type === 'url') {
        maskValue = mask.url;
      } else {
        if (typeof mask.data === 'string') {
          maskValue = mask.data;
        } else {
          maskValue = Buffer.from(mask.data).toString('base64');
        }
      }
    }

    const body: Record<string, unknown> = {
      prompt,
      seed,
      aspect_ratio: finalAspectRatio,
      width: bflOptions?.width ?? (size ? Number(widthStr) : undefined),
      height: bflOptions?.height ?? (size ? Number(heightStr) : undefined),
      steps: bflOptions?.steps,
      guidance: bflOptions?.guidance,
      image_prompt_strength: bflOptions?.imagePromptStrength,
      image_prompt: bflOptions?.imagePrompt,
      ...inputImagesObj,
      mask: maskValue,
      output_format: bflOptions?.outputFormat,
      prompt_upsampling: bflOptions?.promptUpsampling,
      raw: bflOptions?.raw,
      safety_tolerance: bflOptions?.safetyTolerance,
      webhook_secret: bflOptions?.webhookSecret,
      webhook_url: bflOptions?.webhookUrl,
    };

    return { body, warnings };
  }

  async doGenerate({
    prompt,
    files,
    mask,
    size,
    aspectRatio,
    seed,
    providerOptions,
    headers,
    abortSignal,
  }: Parameters<ImageModelV3['doGenerate']>[0]): Promise<
    Awaited<ReturnType<ImageModelV3['doGenerate']>>
  > {
    const { body, warnings } = await this.getArgs({
      prompt,
      files,
      mask,
      size,
      aspectRatio,
      seed,
      providerOptions,
      n: 1,
      headers,
      abortSignal,
    } as Parameters<ImageModelV3['doGenerate']>[0]);

    const bflOptions = await parseProviderOptions({
      provider: 'blackForestLabs',
      providerOptions,
      schema: blackForestLabsImageProviderOptionsSchema,
    });

    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const combinedHeaders = combineHeaders(
      await resolve(this.config.headers),
      headers,
    );

    const submit = await postJsonToApi({
      url: `${this.config.baseURL}/${this.modelId}`,
      headers: combinedHeaders,
      body,
      failedResponseHandler: bflFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(bflSubmitSchema),
      abortSignal,
      fetch: this.config.fetch,
    });

    const pollUrl = submit.value.polling_url;
    const requestId = submit.value.id;

    const {
      imageUrl,
      seed: resultSeed,
      start_time: resultStartTime,
      end_time: resultEndTime,
      duration: resultDuration,
    } = await this.pollForImageUrl({
      pollUrl,
      requestId,
      headers: combinedHeaders,
      abortSignal,
      pollOverrides: {
        pollIntervalMillis: bflOptions?.pollIntervalMillis,
        pollTimeoutMillis: bflOptions?.pollTimeoutMillis,
      },
    });

    const { value: imageBytes, responseHeaders } = await getFromApi({
      url: imageUrl,
      headers: combinedHeaders,
      abortSignal,
      failedResponseHandler: createStatusCodeErrorResponseHandler(),
      successfulResponseHandler: createBinaryResponseHandler(),
      fetch: this.config.fetch,
    });

    return {
      images: [imageBytes],
      warnings,
      providerMetadata: {
        blackForestLabs: {
          images: [
            {
              ...(resultSeed != null && { seed: resultSeed }),
              ...(resultStartTime != null && { start_time: resultStartTime }),
              ...(resultEndTime != null && { end_time: resultEndTime }),
              ...(resultDuration != null && { duration: resultDuration }),
              ...(submit.value.cost != null && { cost: submit.value.cost }),
              ...(submit.value.input_mp != null && {
                inputMegapixels: submit.value.input_mp,
              }),
              ...(submit.value.output_mp != null && {
                outputMegapixels: submit.value.output_mp,
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

  private async pollForImageUrl({
    pollUrl,
    requestId,
    headers,
    abortSignal,
    pollOverrides,
  }: {
    pollUrl: string;
    requestId: string;
    headers: Record<string, string | undefined>;
    abortSignal: AbortSignal | undefined;
    pollOverrides?: {
      pollIntervalMillis?: number;
      pollTimeoutMillis?: number;
    };
  }): Promise<{
    imageUrl: string;
    seed?: number;
    start_time?: number;
    end_time?: number;
    duration?: number;
  }> {
    const pollIntervalMillis =
      pollOverrides?.pollIntervalMillis ??
      this.config.pollIntervalMillis ??
      DEFAULT_POLL_INTERVAL_MILLIS;
    const pollTimeoutMillis =
      pollOverrides?.pollTimeoutMillis ??
      this.config.pollTimeoutMillis ??
      DEFAULT_POLL_TIMEOUT_MILLIS;
    const maxPollAttempts = Math.ceil(
      pollTimeoutMillis / Math.max(1, pollIntervalMillis),
    );

    const url = new URL(pollUrl);
    if (!url.searchParams.has('id')) {
      url.searchParams.set('id', requestId);
    }

    for (let i = 0; i < maxPollAttempts; i++) {
      const { value } = await getFromApi({
        url: url.toString(),
        headers,
        failedResponseHandler: bflFailedResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(bflPollSchema),
        abortSignal,
        fetch: this.config.fetch,
      });

      const status = value.status;
      if (status === 'Ready') {
        if (typeof value.result?.sample === 'string') {
          return {
            imageUrl: value.result.sample,
            seed: value.result.seed ?? undefined,
            start_time: value.result.start_time ?? undefined,
            end_time: value.result.end_time ?? undefined,
            duration: value.result.duration ?? undefined,
          };
        }
        throw new Error(
          'Black Forest Labs poll response is Ready but missing result.sample',
        );
      }
      if (status === 'Error' || status === 'Failed') {
        throw new Error('Black Forest Labs generation failed.');
      }

      await delay(pollIntervalMillis);
    }

    throw new Error('Black Forest Labs generation timed out.');
  }
}

export const blackForestLabsImageProviderOptionsSchema = lazySchema(() =>
  zodSchema(
    z.object({
      imagePrompt: z.string().optional(),
      imagePromptStrength: z.number().min(0).max(1).optional(),
      /** @deprecated use prompt.images instead */
      inputImage: z.string().optional(),
      /** @deprecated use prompt.images instead */
      inputImage2: z.string().optional(),
      /** @deprecated use prompt.images instead */
      inputImage3: z.string().optional(),
      /** @deprecated use prompt.images instead */
      inputImage4: z.string().optional(),
      /** @deprecated use prompt.images instead */
      inputImage5: z.string().optional(),
      /** @deprecated use prompt.images instead */
      inputImage6: z.string().optional(),
      /** @deprecated use prompt.images instead */
      inputImage7: z.string().optional(),
      /** @deprecated use prompt.images instead */
      inputImage8: z.string().optional(),
      /** @deprecated use prompt.images instead */
      inputImage9: z.string().optional(),
      /** @deprecated use prompt.images instead */
      inputImage10: z.string().optional(),
      steps: z.number().int().positive().optional(),
      guidance: z.number().min(0).optional(),
      width: z.number().int().min(256).max(1920).optional(),
      height: z.number().int().min(256).max(1920).optional(),
      outputFormat: z.enum(['jpeg', 'png']).optional(),
      promptUpsampling: z.boolean().optional(),
      raw: z.boolean().optional(),
      safetyTolerance: z.number().int().min(0).max(6).optional(),
      webhookSecret: z.string().optional(),
      webhookUrl: z.url().optional(),
      pollIntervalMillis: z.number().int().positive().optional(),
      pollTimeoutMillis: z.number().int().positive().optional(),
    }),
  ),
);

export type BlackForestLabsImageProviderOptions = InferSchema<
  typeof blackForestLabsImageProviderOptionsSchema
>;

function convertSizeToAspectRatio(
  size: string,
): BlackForestLabsAspectRatio | undefined {
  const [wStr, hStr] = size.split('x');
  const width = Number(wStr);
  const height = Number(hStr);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return undefined;
  }
  const g = gcd(width, height);
  return `${Math.round(width / g)}:${Math.round(height / g)}`;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

const bflSubmitSchema = z.object({
  id: z.string(),
  polling_url: z.url(),
  cost: z.number().nullish(),
  input_mp: z.number().nullish(),
  output_mp: z.number().nullish(),
});

const bflStatus = z.union([
  z.literal('Pending'),
  z.literal('Ready'),
  z.literal('Error'),
  z.literal('Failed'),
  z.literal('Request Moderated'),
]);

const bflPollSchema = z
  .object({
    status: bflStatus.optional(),
    state: bflStatus.optional(),
    details: z.unknown().optional(),
    result: z
      .object({
        sample: z.url(),
        seed: z.number().optional(),
        start_time: z.number().optional(),
        end_time: z.number().optional(),
        duration: z.number().optional(),
      })
      .nullish(),
  })
  .refine(v => v.status != null || v.state != null, {
    message: 'Missing status in Black Forest Labs poll response',
  })
  .transform(v => ({
    status: (v.status ?? v.state)!,
    result: v.result,
  }));

const bflErrorSchema = z.object({
  message: z.string().optional(),
  detail: z.any().optional(),
});

const bflFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: bflErrorSchema,
  errorToMessage: error =>
    bflErrorToMessage(error) ?? 'Unknown Black Forest Labs error',
});

function bflErrorToMessage(error: unknown): string | undefined {
  const parsed = bflErrorSchema.safeParse(error);
  if (!parsed.success) return undefined;
  const { message, detail } = parsed.data;
  if (typeof detail === 'string') return detail;
  if (detail != null) {
    try {
      return JSON.stringify(detail);
    } catch {
      // ignore
    }
  }
  return message;
}
