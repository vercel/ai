import { LanguageModelV1 } from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonResponseHandler,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { openaiFailedResponseHandler } from './openai-error';
import { z } from 'zod';
import { OpenAIConfig } from './openai-config';
import { convertToOpenAIResponsesMessages } from './convert-to-openai-responses-messages';
import { OpenAIResponsesModelId } from './openai-responses-settings';

export class OpenAIResponsesLanguageModel implements LanguageModelV1 {
  readonly specificationVersion = 'v1';
  readonly defaultObjectGenerationMode = 'json';

  readonly modelId: OpenAIResponsesModelId;

  private readonly config: OpenAIConfig;

  constructor(
    modelId: OpenAIResponsesModelId,
    // settings: OpenAIChatSettings,
    config: OpenAIConfig,
  ) {
    this.modelId = modelId;
    // this.settings = settings;
    this.config = config;
  }

  get provider(): string {
    return this.config.provider;
  }

  async doGenerate(
    options: Parameters<LanguageModelV1['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doGenerate']>>> {
    const body = {
      model: this.modelId,
      input: convertToOpenAIResponsesMessages({ prompt: options.prompt }),
    };

    const {
      responseHeaders,
      value: response,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: this.config.url({
        path: '/responses',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        z.object({
          id: z.string(),
          created_at: z.number(),
          model: z.string(),
          output: z.array(
            z.object({
              type: z.literal('message'),
              role: z.literal('assistant'),
              content: z.array(
                z.object({
                  type: z.literal('output_text'),
                  text: z.string(),
                }),
              ),
            }),
          ),
          usage: z.object({
            input_tokens: z.number(),
            output_tokens: z.number(),
          }),
        }),
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    console.log(JSON.stringify(rawResponse, null, 2));

    return {
      text: response.output[0].content[0].text, // TODO what if there are multiple text parts / messages
      finishReason: 'stop',
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
      },
      rawCall: {
        rawPrompt: body, // TODO
        rawSettings: {}, // TODO
      },
      rawResponse: {
        headers: responseHeaders,
      },
      request: {
        body: JSON.stringify(body),
      },
      response: {
        id: response.id,
        timestamp: new Date(response.created_at * 1000),
        modelId: response.model,
      },
    };
  }

  async doStream(
    options: Parameters<LanguageModelV1['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doStream']>>> {
    throw new Error('Method not implemented.');
  }
}
