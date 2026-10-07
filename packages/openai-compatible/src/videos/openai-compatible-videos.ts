import {
  convertToFormData,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  getFromApi,
  postFormDataToApi,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { defaultOpenAICompatibleErrorStructure } from '../openai-compatible-error';

export type OpenAICompatibleVideoCreateOptions = {
  model?: string;
  prompt: string;
  input_reference?: Blob;
  seconds?: string;
  size?: string;
  [key: string]: string | Blob | undefined;
};

const videoResponseSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    error: z.unknown().optional(),
  })
  .passthrough();

export type OpenAICompatibleVideo = z.infer<typeof videoResponseSchema>;

export type OpenAICompatibleVideosConfig = {
  url: (options: { path: string }) => string;
  headers?: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
};

export class OpenAICompatibleVideos {
  private readonly failedResponseHandler = createJsonErrorResponseHandler(
    defaultOpenAICompatibleErrorStructure,
  );

  private readonly successfulResponseHandler =
    createJsonResponseHandler(videoResponseSchema);

  constructor(private readonly config: OpenAICompatibleVideosConfig) {}

  async create(
    request: OpenAICompatibleVideoCreateOptions,
  ): Promise<OpenAICompatibleVideo> {
    const { value } = await postFormDataToApi({
      url: this.config.url({ path: '/videos' }),
      headers: this.config.headers?.(),
      formData: convertToFormData(request),
      failedResponseHandler: this.failedResponseHandler,
      successfulResponseHandler: this.successfulResponseHandler,
      fetch: this.config.fetch,
    });

    return value;
  }

  async retrieve(videoId: string): Promise<OpenAICompatibleVideo> {
    const { value } = await getFromApi({
      url: this.config.url({
        path: `/videos/${encodeURIComponent(videoId)}`,
      }),
      headers: this.config.headers?.(),
      failedResponseHandler: this.failedResponseHandler,
      successfulResponseHandler: this.successfulResponseHandler,
      validateUrl: false,
      fetch: this.config.fetch,
    });

    return value;
  }
}
