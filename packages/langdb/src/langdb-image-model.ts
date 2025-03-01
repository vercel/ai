import { ImageModelV1, ImageModelV1CallWarning } from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonResponseHandler,
  createJsonErrorResponseHandler,
  FetchFunction,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import {
  LangDBImageModelId,
  LangDBImageSettings,
} from './langdb-image-settings';
import { z } from 'zod';

interface LangDBImageModelConfig {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string>;
  fetch?: FetchFunction | undefined;
  _internal?: {
    currentDate?: () => Date;
  };
}

export class LangDBImageModel implements ImageModelV1 {
  readonly specificationVersion = 'v1';

  get provider(): string {
    return this.config.provider;
  }

  get maxImagesPerCall(): number {
    return this.settings.maxImagesPerCall ?? 1;
  }

  constructor(
    readonly modelId: LangDBImageModelId,
    readonly settings: LangDBImageSettings,
    private config: LangDBImageModelConfig,
  ) {}

  async doGenerate({
    prompt,
    n,
    size,
    seed,
    providerOptions,
    headers,
    abortSignal,
  }: Parameters<ImageModelV1['doGenerate']>[0]): Promise<
    Awaited<ReturnType<ImageModelV1['doGenerate']>>
  > {
    const warnings: Array<ImageModelV1CallWarning> = [];

    if (size != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'aspectRatio',
        details:
          'This model does not support the `aspectRatio` option. Use `size` instead.',
      });
    }

    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const splitSize = size?.split('x');
    // https://api.us-east-1.langdb.ai/pricing
    const { value: response, responseHeaders } = await postJsonToApi({
      url: `${this.config.baseURL}/images/generations`,
      headers: combineHeaders(this.config.headers(), headers),
      body: {
        model: this.modelId,
        prompt,
        seed,
        n,
        ...(splitSize && {
          width: parseInt(splitSize[0]),
          height: parseInt(splitSize[1]),
        }),
        response_format: 'B64Json',
        ...(providerOptions.langdb ?? {}),
      },
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: langdbErrorSchema,
        errorToMessage: data => data.error.message,
      }),
      successfulResponseHandler: createJsonResponseHandler(
        langdbImageResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      images: response.data.map(item => item.b64_json),
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
    };
  }
}

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const langdbImageResponseSchema = z.object({
  data: z.array(
    z.object({
      b64_json: z.string(),
    }),
  ),
});

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const langdbErrorSchema = z.object({
  error: z.object({
    message: z.string(),
  }),
});
