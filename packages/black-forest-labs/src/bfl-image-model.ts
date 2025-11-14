import type {
  ImageModelV2,
  ImageModelV2CallWarning,
} from '@ai-sdk/provider';
import type { Resolvable } from '@ai-sdk/provider-utils';
import {
  FetchFunction,
  combineHeaders,
  createBinaryResponseHandler,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  createStatusCodeErrorResponseHandler,
  delay,
  getFromApi,
  postJsonToApi,
  resolve,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { BlackForestLabsAspectRatio } from './bfl-image-settings';
import { BlackForestLabsImageModelId } from './bfl-image-settings';

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

  async doGenerate({
    prompt,
    size,
    aspectRatio,
    providerOptions,
    headers,
    abortSignal,
  }: Parameters<ImageModelV2['doGenerate']>[0]): Promise<
    Awaited<ReturnType<ImageModelV2['doGenerate']>>
  > {
    const warnings: Array<ImageModelV2CallWarning> = [];

    const finalAspectRatio =
      aspectRatio ?? (size ? convertSizeToAspectRatio(size) : undefined);

    if (size && !aspectRatio) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'size',
        details:
          'Black Forest Labs does not accept width/height. Deriving aspect_ratio from size.',
      });
    } else if (size && aspectRatio) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'size',
        details:
          'Black Forest Labs ignores size when aspectRatio is provided.',
      });
    }

    const currentDate = this.config._internal?.currentDate?.() ?? new Date();

    const submit = await postJsonToApi({
      url: `${this.config.baseURL}/${this.modelId}`,
      headers: combineHeaders(await resolve(this.config.headers), headers),
      body: {
        prompt,
        ...(finalAspectRatio ? { aspect_ratio: finalAspectRatio } : {}),
        ...(providerOptions?.bfl ?? {}),
      },
      failedResponseHandler: bflFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(bflSubmitSchema),
      abortSignal,
      fetch: this.config.fetch,
    });

    const pollUrl = submit.value.polling_url;
    const requestId = submit.value.id;
    const imageUrl = await this.pollForImageUrl({
      pollUrl,
      requestId,
      abortSignal,
    });

    const { value: imageBytes, responseHeaders } = await getFromApi({
      url: imageUrl,
      abortSignal,
      failedResponseHandler: createStatusCodeErrorResponseHandler(),
      successfulResponseHandler: createBinaryResponseHandler(),
      fetch: this.config.fetch,
    });

    return {
      images: [imageBytes],
      warnings,
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
    abortSignal,
  }: {
    pollUrl: string;
    requestId: string;
    abortSignal: AbortSignal | undefined;
  }): Promise<string> {
    const url = new URL(pollUrl);
    if (!url.searchParams.has('id')) {
      url.searchParams.set('id', requestId);
    }

    for (let i = 0; i < DEFAULT_MAX_POLL_ATTEMPTS; i++) {
      const { value } = await getFromApi({
        url: url.toString(),
        headers: combineHeaders(await resolve(this.config.headers)),
        failedResponseHandler: bflFailedResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(bflPollSchema),
        abortSignal,
        fetch: this.config.fetch,
      });

      const status = value.status;
      if (status === 'Ready') {
        if (typeof value.result?.sample === 'string') {
          return value.result.sample;
        }
        throw new Error('BFL poll response is Ready but missing result.sample');
      }
      if (status === 'Error' || status === 'Failed') {
        throw new Error('Black Forest Labs generation failed.');
      }

      await delay(DEFAULT_POLL_INTERVAL_MILLIS);
    }

    throw new Error('Black Forest Labs generation timed out.');
  }
}

function convertSizeToAspectRatio(size: string): BlackForestLabsAspectRatio | undefined {
  const [wStr, hStr] = size.split('x');
  const width = Number(wStr);
  const height = Number(hStr);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
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
  polling_url: z.string().url(),
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
        sample: z.string().url(),
      })
      .nullish(),
  })
  .refine(v => v.status != null || v.state != null, {
    message: 'Missing status in BFL poll response',
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
  errorToMessage: error => bflErrorToMessage(error) ?? 'Unknown BFL error',
});

function bflErrorToMessage(error: unknown): string | undefined {
  const parsed = bflErrorSchema.safeParse(error);
  if (!parsed.success) return undefined;
  const { message, detail } = parsed.data as { message?: string; detail?: unknown };
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
