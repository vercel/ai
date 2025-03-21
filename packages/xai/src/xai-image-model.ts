import { ImageModelV1, ImageModelV1CallWarning } from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  FetchFunction,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { XaiImageModelId } from './xai-image-settings';
import { XaiImageSettings } from './xai-image-settings';
import { xaiErrorSchema } from './xai-error';

export type XaiImageModelConfig = {
  provider: string;
  headers: () => Record<string, string | undefined>;
  url: (options: { modelId: string; path: string }) => string;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
};

export class XaiImageModel implements ImageModelV1 {
  readonly specificationVersion = 'v1';

  get maxImagesPerCall(): number {
    return this.settings.maxImagesPerCall ?? 10;
  }

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: XaiImageModelId,
    private readonly settings: XaiImageSettings,
    private readonly config: XaiImageModelConfig,
  ) {}

  async doGenerate({
    prompt,
    n,
    size,
    aspectRatio,
    seed,
    providerOptions,
    headers,
    abortSignal,
  }: Parameters<ImageModelV1['doGenerate']>[0]): Promise<
    Awaited<ReturnType<ImageModelV1['doGenerate']>>
  > {
    const warnings: Array<ImageModelV1CallWarning> = [];

    if (aspectRatio != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'aspectRatio',
        details:
          'This model does not support aspect ratio. Use `size` instead.',
      });
    }

    if (seed != null) {
      warnings.push({ type: 'unsupported-setting', setting: 'seed' });
    }

    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { value: response, responseHeaders } = await postJsonToApi({
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
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: xaiErrorSchema,
        errorToMessage: data => data.error,
      }),
      successfulResponseHandler: createJsonResponseHandler(
        openaiCompatibleImageResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      images: response.data.map(item => {
        const b64Data = item.b64_json;
        return b64Data.startsWith('data:') && b64Data.includes(',')
          ? b64Data.split(',')[1]
          : b64Data;
      }),
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
    };
  }
}

// minimal version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const openaiCompatibleImageResponseSchema = z.object({
  data: z.array(z.object({ b64_json: z.string() })),
});
