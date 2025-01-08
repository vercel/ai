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
}

export class ReplicateImageModel implements ImageModelV1 {
  readonly specificationVersion = 'v1';

  readonly modelId: ReplicateImageModelId;
  readonly settings: ReplicateImageSettings;

  private readonly config: ReplicateImageModelConfig;

  get provider(): string {
    return this.config.provider;
  }

  get maxImagesPerCall(): number {
    return this.settings.maxImagesPerCall ?? 1;
  }

  constructor(
    modelId: ReplicateImageModelId,
    settings: ReplicateImageSettings,
    config: ReplicateImageModelConfig,
  ) {
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
  }

  async doGenerate({
    prompt,
    n = 1,
    size,
    providerOptions,
    headers,
    abortSignal,
  }: Parameters<ImageModelV1['doGenerate']>[0]): Promise<
    Awaited<ReturnType<ImageModelV1['doGenerate']>>
  > {
    const warnings: Array<ImageModelV1CallWarning> = [];

    if (size) {
      throw new Error(
        'Replicate does not support the `size` option. Some models support width and height, some support aspect ratio, etc. Use model-specific input parameters instead, setting them in `providerOptions.replicate.input`.',
      );
    }

    const body = {
      input: {
        prompt,
        num_outputs: n,
        ...((providerOptions.replicate?.input as Record<string, unknown>) ??
          {}),
      },
    };

    const {
      value: { output },
    } = await postJsonToApi({
      url: `${this.config.baseURL}/models/${this.modelId}/predictions`,
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
    const images = await Promise.all(
      output.map(async url => {
        const response = await fetch(url);
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        return new Uint8Array(arrayBuffer);
      }),
    );

    return { images, warnings };
  }
}

const replicateImageResponseSchema = z.object({
  output: z.array(z.string()),
});
