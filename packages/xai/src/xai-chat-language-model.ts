import {
  LanguageModelV2,
  LanguageModelV2CallWarning,
  LanguageModelV2Content,
  LanguageModelV2FinishReason,
  LanguageModelV2StreamPart,
  LanguageModelV2Usage,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  FetchFunction,
  parseProviderOptions,
  ParseResult,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { XaiChatModelId } from './xai-chat-options';

type XaiChatConfig = {
  provider: string;
  baseURL: string | undefined;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
};

export class XaiChatLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2';

  readonly modelId: XaiChatModelId;

  private readonly config: XaiChatConfig;

  constructor(modelId: XaiChatModelId, config: XaiChatConfig) {
    this.modelId = modelId;
    this.config = config;
  }

  get provider(): string {
    return this.config.provider;
  }

  readonly supportedUrls: Record<string, RegExp[]> = {
    'application/pdf': [/^https:\/\/.*$/],
  };

  private async getArgs({
    prompt,
    maxOutputTokens,
    temperature,
    topP,
    seed,
  }: Parameters<LanguageModelV2['doGenerate']>[0]) {
    const warnings: LanguageModelV2CallWarning[] = [];

    const baseArgs = {
      // the model we're using
      model: this.modelId,

      // standard generation settings
      max_tokens: maxOutputTokens,
      temperature,
      top_p: topP,
      seed,

      // convert prompt to xai message format
      messages: [], // TODO: implement message conversion
    };

    return {
      args: baseArgs,
      warnings,
    };
  }

  async doGenerate(
    options: Parameters<LanguageModelV2['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doGenerate']>>> {
    // TODO: Implement
    throw new Error('Not implemented yet');
  }

  async doStream(
    options: Parameters<LanguageModelV2['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doStream']>>> {
    const { args, warnings } = await this.getArgs(options);
    console.log('XAI doStream would send:', JSON.stringify(args, null, 2));

    // actual api call comes next
    throw new Error('Not implemented yet - but args prepared!');
  }
}
