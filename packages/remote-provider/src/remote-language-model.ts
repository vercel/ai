import { LanguageModelV1 } from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  FetchFunction,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { RemoteModelId } from './remote-language-model-settings';

type RemoteChatConfig = {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
};

export class RemoteLanguageModel implements LanguageModelV1 {
  readonly specificationVersion = 'v1';
  readonly defaultObjectGenerationMode = 'json'; // TODO problem = model settings built into provider
  readonly supportsImageUrls = false; // TODO problem = model settings built into provider
  // ==> we need to built model and some capabilities list into the provider

  readonly modelId: RemoteModelId;

  private readonly config: RemoteChatConfig;

  constructor(modelId: RemoteModelId, config: RemoteChatConfig) {
    this.modelId = modelId;
    this.config = config;
  }

  get provider(): string {
    return this.config.provider;
  }

  async doGenerate(
    options: Parameters<LanguageModelV1['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doGenerate']>>> {
    console.log('doGenerate', JSON.stringify(options, null, 2));

    const headers = combineHeaders(this.config.headers(), options.headers, {
      'ai-language-model-specification-version': '1',
      'ai-language-model-id': this.modelId,
    });

    console.log(JSON.stringify(headers, null, 2));

    const { value } = await postJsonToApi({
      url: this.config.baseURL,
      headers: headers,
      body: options,
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: z.any(),
        errorToMessage: data => data,
      }),
      successfulResponseHandler: createJsonResponseHandler(z.any()),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    console.log(JSON.stringify(value, null, 2));

    return value;
  }

  async doStream(
    options: Parameters<LanguageModelV1['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doStream']>>> {
    throw new Error('Not implemented');
  }
}
