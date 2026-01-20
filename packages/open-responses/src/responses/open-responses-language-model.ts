import {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Content,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamResult,
  SharedV3Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  jsonSchema,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { convertToOpenResponsesInput } from './convert-to-open-responses-input';
import {
  OpenResponsesApiRequestBody,
  OpenResponsesApiResponseBody,
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
    body: Omit<OpenResponsesApiRequestBody, 'stream' | 'stream_options'>;
    warnings: SharedV3Warning[];
  }> {
    const { input, warnings: inputWarnings } =
      await convertToOpenResponsesInput({
        prompt,
      });

    return {
      body: {
        model: this.modelId,
        input,
        max_output_tokens: maxOutputTokens,
        temperature
      },
      warnings: inputWarnings,
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
      successfulResponseHandler: createJsonResponseHandler(
        // do not validate the response body, only apply types to the response body
        jsonSchema<OpenResponsesApiResponseBody>(() => {
          throw new Error('json schema not implemented');
        }),
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const content: Array<LanguageModelV3Content> = [];

    for (const part of response.output!) {
      switch (part.type) {
        // TODO AI SDK 7 adjust reasoning in the specification to better support the reasoning structure from open responses.
        case 'reasoning': {
          for (const contentPart of part.content ?? []) {
            content.push({
              type: 'reasoning',
              text: contentPart.text,
            });
          }
          break;
        }

        case 'message': {
          for (const contentPart of part.content) {
            content.push({
              type: 'text',
              text: contentPart.text,
            });
          }

          break;
        }
      }
    }

    return {
      content,
      finishReason: {
        unified: 'stop',
        raw: undefined,
      },
      usage: {
        inputTokens: {
          total: undefined,
          noCache: undefined,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: {
          total: undefined,
          text: undefined,
          reasoning: undefined,
        },
      },
      request: { body },
      response: {
        id: response.id,
        timestamp: new Date(response.created_at! * 1000),
        modelId: response.model,
        headers: responseHeaders,
        body: rawResponse,
      },
      providerMetadata: undefined,
      warnings,
    };
  }

  async doStream(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3StreamResult> {
    throw new Error('Not implemented');
  }
}
