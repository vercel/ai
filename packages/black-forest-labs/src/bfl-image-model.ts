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
  getFromApi,
  postJsonToApi,
  resolve,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { BlackForestLabsAspectRatio } from './bfl-image-settings';
import { BlackForestLabsImageModelId } from './bfl-image-settings';

interface BlackForestLabsImageModelConfig {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
    pollIntervalMs?: number;
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
        ...(providerOptions.bfl ?? {}),
        ...(providerOptions['black-forest-labs'] ?? {}),
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

    while (true) {
      const response = await (this.config.fetch ?? fetch)(url.toString(), {
        method: 'GET',
        headers: Object.fromEntries(
          Object.entries(combineHeaders(await resolve(this.config.headers))).filter(
            ([, v]) => v !== undefined,
          ),
        ) as Record<string, string>,
        signal: abortSignal,
      });
      if (!response.ok) {
        const errorBody = await safeParseJson(response);
        const message =
          bflErrorToMessage(errorBody) ?? response.statusText ?? 'BFL error';
        throw new Error(message);
      }
      const json = (await response.json()) as unknown;
      let status: string | undefined;
      let sampleUrl: string | undefined;
      if (json && typeof json === 'object') {
        const payload = json as Record<string, unknown>;
        status =
          typeof payload.status === 'string'
            ? (payload.status as string)
            : typeof (payload as Record<string, unknown>).state === 'string'
              ? ((payload as Record<string, unknown>).state as string)
              : undefined;
        const result = payload.result as Record<string, unknown> | undefined;
        if (result && typeof result.sample === 'string') {
          sampleUrl = result.sample as string;
        } else if (typeof (payload as Record<string, unknown>).sample === 'string') {
          sampleUrl =
            ((payload as Record<string, unknown>).sample as string) ?? undefined;
        }
      } else if (typeof json === 'string') {
        status = json;
      }

      if (status === 'Ready') {
        if (!sampleUrl) {
          throw new Error('BFL poll response is Ready but missing result sample.');
        }
        return sampleUrl;
      }
      if (status === 'Error' || status === 'Failed') {
        const msg =
          bflErrorToMessage(json) ?? 'Black Forest Labs generation failed.';
        throw new Error(msg);
      }

      await delay(
        this.config._internal?.pollIntervalMs != null
          ? this.config._internal.pollIntervalMs
          : 500,
        abortSignal,
      );
    }
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

async function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return;
  return new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(id);
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
    }
  });
}

const bflSubmitSchema = z.object({
  id: z.string(),
  polling_url: z.string().url(),
});

const bflPollSchema = z.object({
  status: z.string(),
  result: z
    .object({
      sample: z.string(),
    })
    .optional(),
});

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

async function safeParseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}
