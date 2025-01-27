import type { ImageModelV1, ImageModelV1CallWarning } from '@ai-sdk/provider';
import type { Resolvable } from '@ai-sdk/provider-utils';
import {
  FetchFunction,
  combineHeaders,
  createJsonResponseHandler,
  postJsonToApi,
  resolve,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { replicateFailedResponseHandler } from './replicate-error';
import {
  ReplicateImageModelId,
  ReplicateImageSettings,
} from './replicate-image-settings';

interface ReplicateImageModelConfig {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
}

export class ReplicateImageModel implements ImageModelV1 {
  readonly specificationVersion = 'v1';

  get provider(): string {
    return this.config.provider;
  }

  get maxImagesPerCall(): number {
    return this.settings.maxImagesPerCall ?? 1;
  }

  constructor(
    readonly modelId: ReplicateImageModelId,
    private readonly settings: ReplicateImageSettings,
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
  }: Parameters<ImageModelV1['doGenerate']>[0]): Promise<
    Awaited<ReturnType<ImageModelV1['doGenerate']>>
  > {
    const warnings: Array<ImageModelV1CallWarning> = [];

    const isVersionedModel = this.modelId.includes(":");
    
    const url = isVersionedModel ?
      // https://replicate.com/docs/reference/http#predictions.create
      `${this.config.baseURL}/predictions` :
      // https://replicate.com/docs/reference/http#models.predictions.create
      `${this.config.baseURL}/models/${this.modelId}/predictions`;

    const body = {
      input: {
        prompt,
        aspect_ratio: aspectRatio,
        size,
        seed,
        num_outputs: n,
        ...(providerOptions.replicate ?? {}),
      }
    };

    if (isVersionedModel) {
      body.version = this.modelId.split(":")[1];
    }

    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const {
      value: { output },
      responseHeaders,
    } = await postJsonToApi({
      url,
      headers: combineHeaders(await resolve(this.config.headers), headers, {
        prefer: 'wait',
      }),
      body,
      failedResponseHandler: replicateFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        replicateImageResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    // download the images:
    const outputArray = Array.isArray(output) ? output : [output];
    const images = await Promise.all(
      outputArray.map(async url => {
        const response = await fetch(url);
        return new Uint8Array(await response.arrayBuffer());
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
}

const replicateImageResponseSchema = z.object({
  output: z.union([z.array(z.string()), z.string()]),
});
