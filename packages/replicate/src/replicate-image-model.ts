import type { ImageModelV1, ImageModelV1CallWarning } from '@ai-sdk/provider';
import type { Resolvable } from '@ai-sdk/provider-utils';
import {
  combineHeaders,
  createJsonResponseHandler,
  postJsonToApi,
  resolve,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { replicateFailedResponseHandler } from './replicate-error';

export type ReplicateImageModelId =
  | 'black-forest-labs/flux-1.1-pro'
  | 'black-forest-labs/flux-1.1-pro-ultra'
  | 'black-forest-labs/flux-dev'
  | 'black-forest-labs/flux-pro'
  | 'black-forest-labs/flux-schnell'
  | 'bytedance/sdxl-lightning-4step'
  | 'fofr/aura-flow'
  | 'fofr/latent-consistency-model'
  | 'fofr/realvisxl-v3-multi-controlnet-lora'
  | 'fofr/sdxl-emoji'
  | 'fofr/sdxl-multi-controlnet-lora'
  | 'ideogram-ai/ideogram-v2'
  | 'ideogram-ai/ideogram-v2-turbo'
  | 'lucataco/dreamshaper-xl-turbo'
  | 'lucataco/open-dalle-v1.1'
  | 'lucataco/realvisxl-v2.0'
  | 'lucataco/realvisxl2-lcm'
  | 'luma/photon'
  | 'luma/photon-flash'
  | 'nvidia/sana'
  | 'playgroundai/playground-v2.5-1024px-aesthetic'
  | 'recraft-ai/recraft-v3'
  | 'recraft-ai/recraft-v3-svg'
  | 'stability-ai/stable-diffusion-3.5-large'
  | 'stability-ai/stable-diffusion-3.5-large-turbo'
  | 'stability-ai/stable-diffusion-3.5-medium'
  | 'tstramer/material-diffusion'
  | (string & {});

interface ReplicateImageModelConfig {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: typeof fetch;
}

export class ReplicateImageModel implements ImageModelV1 {
  readonly specificationVersion = 'v1';
  readonly maxImagesPerCall = 1;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: ReplicateImageModelId,
    private config: ReplicateImageModelConfig,
  ) {
    this.config.headers = {
      ...this.config.headers,
      Prefer: 'wait',
    };
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
      headers: combineHeaders(await resolve(this.config.headers), headers),
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
