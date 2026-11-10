import { type ImageModelV4 } from '@ai-sdk/provider';
import {
  type FetchFunction,
  type Resolvable,
  combineHeaders,
  convertImageModelFileToDataUri,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  lazySchema,
  parseProviderOptions,
  postJsonToApi,
  resolve,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export type MiniMaxImageModelId = 'MiniMax-H3-Image' | (string & {});

export type MiniMaxImageModelOptions = {
  /**
   * Output area. The API defaults to `4K` when `size` is omitted.
   * Cannot be combined with `size`.
   */
  area?: '1K' | '2K' | '4K';
};

const minimaxImageModelOptionsSchema = lazySchema(() =>
  zodSchema(
    z.object({
      area: z.enum(['1K', '2K', '4K']).optional(),
    }),
  ),
);

interface MiniMaxImageModelConfig {
  provider: string;
  baseURL: string;
  headers: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
}

export class MiniMaxImageModel implements ImageModelV4 {
  readonly specificationVersion = 'v4';
  readonly maxImagesPerCall = 10;
  readonly supportsFileInputs = true;
  readonly supportsMaskInputs = false;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: MiniMaxImageModelId,
    private readonly config: MiniMaxImageModelConfig,
  ) {}

  async doGenerate({
    prompt,
    n,
    size,
    aspectRatio,
    providerOptions,
    headers,
    abortSignal,
    files,
  }: Parameters<ImageModelV4['doGenerate']>[0]): Promise<
    Awaited<ReturnType<ImageModelV4['doGenerate']>>
  > {
    const minimaxOptions =
      (await parseProviderOptions({
        provider: 'minimax',
        providerOptions,
        schema: minimaxImageModelOptionsSchema,
      })) ?? {};

    const body: Record<string, unknown> = {
      model: this.modelId,
      prompt,
      n,
      response_format: 'b64_json',
    };

    if (size != null) {
      body.size = size;
    } else {
      if (aspectRatio != null) {
        body.aspect_ratio = aspectRatio;
      }
      if (minimaxOptions.area != null) {
        body.area = minimaxOptions.area;
      }
    }

    const isEditing = files != null && files.length > 0;
    if (isEditing) {
      body.images = files.map(file => ({
        image_url: convertImageModelFileToDataUri(file),
      }));
    }

    const { value: response, responseHeaders } = await postJsonToApi({
      url: `${this.config.baseURL}/v1/images/${isEditing ? 'edits' : 'generations'}`,
      headers: combineHeaders(await resolve(this.config.headers), headers),
      body,
      failedResponseHandler: minimaxImageFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        minimaxImageResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      images: response.data.map(item => item.b64_json),
      warnings: [],
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: responseHeaders,
      },
    };
  }
}

const minimaxImageResponseSchema = lazySchema(() =>
  zodSchema(z.object({ data: z.array(z.object({ b64_json: z.string() })) })),
);

const minimaxImageFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: lazySchema(() =>
    zodSchema(
      z.object({
        error: z.object({ message: z.string().nullish() }).nullish(),
      }),
    ),
  ),
  errorToMessage: data =>
    (data as { error?: { message?: string | null } | null }).error?.message ??
    'MiniMax image generation error',
});
