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

const SUPPORTED_MODEL_IDS = [
  'black-forest-labs/flux-schnell',
  'black-forest-labs/flux-dev'
] as const;

type SupportedModelId = typeof SUPPORTED_MODEL_IDS[number];

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
    readonly modelId: SupportedModelId,
    private config: ReplicateImageModelConfig,
  ) {
    if (!SUPPORTED_MODEL_IDS.includes(modelId as SupportedModelId)) {
      throw new Error(
        `Unsupported model: ${modelId}. ` + 
        `Supported models are: ${SUPPORTED_MODEL_IDS.join(', ')}`
      );
    }
    this.config.headers = {
      ...this.config.headers,
      'Prefer': 'wait',
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
    if (size) {
      throw new Error(
        'Replicate does not support the `size` option. Some models support width and height, some support aspect ratio, etc. Use model-specific input parameters instead, setting them in `providerOptions.replicate.input`.',
      );
    }

    const [owner, model] = this.modelId.split('/');
    
    const url = `${this.config.baseURL}/models/${owner}/${model}/predictions`;
    
    const body = {
      input: {
        prompt,
        num_outputs: n,
        ...(providerOptions.replicate?.input as Record<string, unknown> ?? {}),
      },
    };

    const combinedHeaders = combineHeaders(await resolve(this.config.headers), headers);

    const { value: response } = await postJsonToApi({
      url,
      headers: combinedHeaders,
      body,
      failedResponseHandler: replicateFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        replicateImageResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    // Some models return a single image URL, others return an array of image URLs
    const images = Array.isArray(response.output) ? response.output : [response.output];

    return {
      images,
    };
  }
}

const replicateImageResponseSchema = z.object({
  output: z.array(z.string()),
}); 