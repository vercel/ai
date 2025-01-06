import type { ImageModelV1 } from '@ai-sdk/provider';
import type { Resolvable } from '@ai-sdk/provider-utils';
import {
  postJsonToApi,
  combineHeaders,
  createJsonResponseHandler,
  resolve,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { replicateFailedResponseHandler } from './replicate-error';

export type ReplicateImageModelId = 
  | 'black-forest-labs/flux-schnell'
  | 'black-forest-labs/flux-dev'
  | (string & {});

interface ReplicateImageModelConfig {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: typeof fetch;
}

export class ReplicateImageModel implements ImageModelV1 {
  readonly specificationVersion = 'v1';

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: ReplicateImageModelId,
    private config: ReplicateImageModelConfig,
  ) {}

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
    if (size) {
      throw new Error(
        'Replicate does not support the `size` option. Use ' +
          '`providerOptions.replicate.input.width` and ' +
          '`providerOptions.replicate.input.height` instead.',
      );
    }

    const [owner, model] = this.modelId.split('/');
    
    const body = {
      version: providerOptions.replicate?.version,
      input: {
        prompt,
        num_outputs: n,
        ...(providerOptions.replicate?.input ?? {}),
      },
    };

    const { value: response } = await postJsonToApi({
      url: `${this.config.baseURL}/models/${owner}/${model}/predictions`,
      headers: combineHeaders(await resolve(this.config.headers), headers),
      body,
      failedResponseHandler: replicateFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        replicateImageResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      images: response.output,
    };
  }
}

const replicateImageResponseSchema = z.object({
  output: z.array(z.string()),
}); 