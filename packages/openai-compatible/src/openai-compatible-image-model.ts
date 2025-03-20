import {
  APICallError,
  ImageModelV1,
  ImageModelV1CallWarning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  FetchFunction,
  postJsonToApi,
  ResponseHandler,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import {
  defaultOpenAICompatibleErrorStructure,
  ProviderErrorStructure,
} from './openai-compatible-error';
import {
  OpenAICompatibleImageModelId,
  OpenAICompatibleImageSettings,
} from './openai-compatible-image-settings';

export type OpenAICompatibleImageModelConfig = {
  provider: string;
  headers: () => Record<string, string | undefined>;
  url: (options: { modelId: string; path: string }) => string;
  fetch?: FetchFunction;
  errorStructure?: ProviderErrorStructure<any>;
  _internal?: {
    currentDate?: () => Date;
  };
};

export class OpenAICompatibleImageModel implements ImageModelV1 {
  readonly specificationVersion = 'v1';

  private readonly failedResponseHandler: ResponseHandler<APICallError>;

  get maxImagesPerCall(): number {
    return this.settings.maxImagesPerCall ?? 10;
  }

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: OpenAICompatibleImageModelId,
    private readonly settings: OpenAICompatibleImageSettings,
    private readonly config: OpenAICompatibleImageModelConfig,
  ) {
    // initialize error handling:
    const errorStructure =
      config.errorStructure ?? defaultOpenAICompatibleErrorStructure;
    this.failedResponseHandler = createJsonErrorResponseHandler(errorStructure);
  }

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
      failedResponseHandler: this.failedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        openaiCompatibleImageResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      images: response.data.map(item => maybeStripDataUriPrefix(item.b64_json)),
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
    };
  }
}

const maybeStripDataUriPrefix = (dataUri: string) => {
  return dataUri.startsWith('data:image') ? dataUri.split(',')[1] : dataUri;
};

// minimal version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const openaiCompatibleImageResponseSchema = z.object({
  data: z.array(z.object({ b64_json: z.string() })),
});
