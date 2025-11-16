import type { ImageModelV2, ImageModelV2CallWarning } from '@ai-sdk/provider';
import type { InferValidator, Resolvable } from '@ai-sdk/provider-utils';
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
const DEFAULT_MAX_POLL_ATTEMPTS = 60000 / DEFAULT_POLL_INTERVAL_MILLIS;

interface BlackForestLabsImageModelConfig {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
}

export class BlackForestLabsImageModel implements ImageModelV2 {
  readonly specificationVersion = 'v2';
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
    size,
    aspectRatio,
    seed,
    providerOptions,
  }: Parameters<ImageModelV2['doGenerate']>[0]) {
    const warnings: Array<ImageModelV2CallWarning> = [];

    const finalAspectRatio =
      aspectRatio ?? (size ? convertSizeToAspectRatio(size) : undefined);

    if (size && !aspectRatio) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'size',
        details: 'Deriving aspect_ratio from size.',
      });
    } else if (size && aspectRatio) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'size',
        details: 'Black Forest Labs ignores size when aspectRatio is provided.',
      });
    }

    const bflOptions = await parseProviderOptions({
      provider: 'blackForestLabs',
      providerOptions,
      schema: blackForestLabsImageProviderOptionsSchema,
    });

    const body: Record<string, unknown> = {
      prompt,
      ...(finalAspectRatio ? { aspect_ratio: finalAspectRatio } : {}),
    };

    if (typeof seed === 'number') {
      body.seed = seed;
    } else if (bflOptions && 'seed' in bflOptions) {
      body.seed = bflOptions.seed as number | null | undefined;
    }

    if (bflOptions) {
      if (bflOptions.prompt_upsampling != null)
        body.prompt_upsampling = bflOptions.prompt_upsampling;
      if (bflOptions.safety_tolerance != null)
        body.safety_tolerance = bflOptions.safety_tolerance;
      if (bflOptions.output_format != null)
        body.output_format = bflOptions.output_format;
      if (bflOptions.webhook_url != null)
        body.webhook_url = bflOptions.webhook_url;
      if (bflOptions.webhook_secret != null)
        body.webhook_secret = bflOptions.webhook_secret;
      if (bflOptions.input_image != null)
        body.input_image = bflOptions.input_image;
      if (bflOptions.width != null) body.width = bflOptions.width;
      if (bflOptions.height != null) body.height = bflOptions.height;
      if (bflOptions.image_prompt != null)
        body.image_prompt = bflOptions.image_prompt;
      if (bflOptions.image_prompt_strength != null)
        body.image_prompt_strength = bflOptions.image_prompt_strength;
      if (bflOptions.raw != null) body.raw = bflOptions.raw;
    }

    return { body, warnings };
  }

  async doGenerate({
    prompt,
    size,
    aspectRatio,
    seed,
    providerOptions,
    headers,
    abortSignal,
  }: Parameters<ImageModelV2['doGenerate']>[0]): Promise<
    Awaited<ReturnType<ImageModelV2['doGenerate']>>
  > {
    const { body, warnings } = await this.getArgs({
      prompt,
      size,
      aspectRatio,
      seed,
      providerOptions,
      n: 1,
      headers,
      abortSignal,
    } as Parameters<ImageModelV2['doGenerate']>[0]);

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
  }: {
    pollUrl: string;
    requestId: string;
    headers: Record<string, string | undefined>;
    abortSignal: AbortSignal | undefined;
  }): Promise<{
    imageUrl: string;
    seed?: number;
    start_time?: number;
    end_time?: number;
    duration?: number;
  }> {
    const url = new URL(pollUrl);
    if (!url.searchParams.has('id')) {
      url.searchParams.set('id', requestId);
    }

    for (let i = 0; i < DEFAULT_MAX_POLL_ATTEMPTS; i++) {
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

      await delay(DEFAULT_POLL_INTERVAL_MILLIS);
    }

    throw new Error('Black Forest Labs generation timed out.');
  }
}

export const blackForestLabsImageProviderOptionsSchema = lazySchema(() =>
  zodSchema(
    z.object({
      seed: z.number().int().nullish(),
      prompt_upsampling: z.boolean().nullish(),
      safety_tolerance: z.number().int().min(0).max(6).nullish(),
      output_format: z.enum(['jpeg', 'png']).nullish(),
      webhook_url: z.url().nullish(),
      webhook_secret: z.string().nullish(),
      input_image: z.string().nullish(),
      width: z.number().int().nullish(),
      height: z.number().int().nullish(),
      image_prompt: z.string().nullish(),
      image_prompt_strength: z.number().min(0).max(1).nullish(),
      raw: z.boolean().nullish(),
    }),
  ),
);

export type BlackForestLabsImageProviderOptions = InferValidator<
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
});

const bflStatus = z.union([
  z.literal('Pending'),
  z.literal('Ready'),
  z.literal('Error'),
  z.literal('Failed'),
]);

const bflPollSchema = z
  .object({
    status: bflStatus.optional(),
    state: bflStatus.optional(),
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
