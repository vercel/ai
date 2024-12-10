import { ImageModelV1 } from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonResponseHandler,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { OpenAIConfig } from './openai-config';
import { openaiFailedResponseHandler } from './openai-error';

export type OpenAIImageModelId = 'dall-e-3' | 'dall-e-2' | (string & {});

export class OpenAIImageModel implements ImageModelV1 {
  readonly specificationVersion = 'v1';
  readonly modelId: OpenAIImageModelId;

  private readonly config: OpenAIConfig;

  get provider(): string {
    return this.config.provider;
  }

  constructor(modelId: OpenAIImageModelId, config: OpenAIConfig) {
    this.modelId = modelId;
    this.config = config;
  }

  async doGenerate({
    prompt,
    n,
    size,
    providerOptions,
    headers,
    abortSignal,
  }: Parameters<ImageModelV1['doGenerate']>[0]): Promise<
    Awaited<ReturnType<ImageModelV1['doGenerate']>>
  > {
    const { value: response } = await postJsonToApi({
      url: this.config.url({
        path: '/images/generations',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), headers),
      body: {
        model: this.modelId,
        prompt,
        n,
        size,
        ...(providerOptions.openai ?? {}),
        response_format: 'b64_json',
      },
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        openaiImageResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      images: response.data.map(item => item.b64_json),
    };
  }
}

// minimal version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const openaiImageResponseSchema = z.object({
  data: z.array(z.object({ b64_json: z.string() })),
});
