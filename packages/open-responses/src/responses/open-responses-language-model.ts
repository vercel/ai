import {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamResult,
  SharedV3Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonErrorResponseHandler,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import {
  OpenResponseApiBody,
  openResponsesErrorSchema,
} from './open-responses-api';
import { OpenResponsesConfig } from './open-responses-config';

export class OpenResponsesLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3';

  readonly modelId: string;

  private readonly config: OpenResponsesConfig;

  constructor(modelId: string, config: OpenResponsesConfig) {
    this.modelId = modelId;
    this.config = config;
  }

  readonly supportedUrls: Record<string, RegExp[]> = {};

  get provider(): string {
    return this.config.provider;
  }

  private async getArgs({
    maxOutputTokens,
    temperature,
    stopSequences,
    topP,
    topK,
    presencePenalty,
    frequencyPenalty,
    seed,
    prompt,
    providerOptions,
    tools,
    toolChoice,
    responseFormat,
  }: LanguageModelV3CallOptions): Promise<{
    body: Omit<OpenResponseApiBody, 'stream' | 'stream_options'>;
    warnings: SharedV3Warning[];
  }> {
    const warnings: SharedV3Warning[] = [];

    return {
      body: {
        model: this.modelId,
      },
      warnings,
    };
  }

  async doGenerate(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3GenerateResult> {
    const { body, warnings } = await this.getArgs(options);

    const {
      responseHeaders,
      value: response,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: this.config.url,
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: openResponsesErrorSchema,
        errorToMessage: error => error.error.message,
      }),
      successfulResponseHandler: () => {
        throw new Error('Not implemented');
      },
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    throw new Error('Not implemented');
  }

  async doStream(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3StreamResult> {
    throw new Error('Not implemented');
  }
}
