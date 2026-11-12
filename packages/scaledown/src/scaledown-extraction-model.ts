import {
  Experimental_ExtractionUnsupportedFieldTypeError as ExtractionUnsupportedFieldTypeError,
  type Experimental_ExtractionModelV4 as ExtractionModelV4,
  type Experimental_ExtractionModelV4Answer as ExtractionModelV4Answer,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonResponseHandler,
  loadApiKey,
  parseJSON,
  parseProviderOptions,
  postJsonToApi,
  resolve,
  serializeModelOptions,
  withUserAgentSuffix,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  type FetchFunction,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { convertScaleDownExtractionSource } from './convert-scaledown-extraction-source';
import { convertToScaleDownState } from './convert-to-scaledown-state';
import { scaledownFailedResponseHandler } from './scaledown-error';
import {
  scaledownExtractionContentSchema,
  scaledownExtractionResponseSchema,
} from './scaledown-extraction-api';
import {
  scaledownExtractionModelOptionsSchema,
  type ScaleDownExtractionModelId,
} from './scaledown-extraction-model-options';
import { VERSION } from './version';

type ScaleDownExtractionModelConfig = {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
};

export class ScaleDownExtractionModel implements ExtractionModelV4 {
  readonly specificationVersion = 'v4';
  readonly supportedFieldTypes = ['text', 'list'] as const;

  constructor(
    readonly modelId: ScaleDownExtractionModelId,
    private readonly config: ScaleDownExtractionModelConfig,
  ) {}

  get provider() {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: ScaleDownExtractionModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: ScaleDownExtractionModelId;
    config: ScaleDownExtractionModelConfig;
  }) {
    return new ScaleDownExtractionModel(options.modelId, options.config);
  }

  async doExtract({
    state,
    fields,
    referenceDate,
    maxOutputTokens,
    reasoning,
    headers,
    abortSignal,
    providerOptions,
  }: Parameters<ExtractionModelV4['doExtract']>[0]): Promise<
    Awaited<ReturnType<ExtractionModelV4['doExtract']>>
  > {
    const properties = Object.fromEntries(
      Object.entries(fields).map(([id, field]) => {
        if (
          field.type !== 'text' &&
          !(field.type === 'list' && field.items === 'text')
        ) {
          throw new ExtractionUnsupportedFieldTypeError({
            provider: this.provider,
            modelId: this.modelId,
            fieldId: id,
            fieldType:
              field.type === 'list' ? `list<${field.items}>` : field.type,
          });
        }
        return [
          id,
          {
            type: 'string',
            description:
              field.instructions == null
                ? undefined
                : typeof field.instructions === 'string'
                  ? field.instructions
                  : JSON.stringify(field.instructions),
            // Scalar schemas retain entity confidence and offsets for every match.
            top_n: field.type === 'text' ? 1 : 0,
          },
        ];
      }),
    );
    const extractionOptions = await parseProviderOptions({
      provider: 'scaledown',
      providerOptions,
      schema: scaledownExtractionModelOptionsSchema,
    });
    const { text, ...document } = convertToScaleDownState(state);
    let inputText = text ?? '';
    // ScaleDown requires a non-empty user message even with a document.
    if (document.document != null && inputText.trim() === '') {
      inputText = 'Extract the requested fields from the document.';
    }
    const { value, rawValue, responseHeaders } = await postJsonToApi({
      url: `${this.config.baseURL}/v1/chat/completions`,
      headers: combineHeaders(
        this.config.headers === undefined
          ? withUserAgentSuffix(
              {
                'x-api-key': loadApiKey({
                  apiKey: undefined,
                  environmentVariableName: 'SCALEDOWN_API_KEY',
                  description: 'ScaleDown',
                }),
              },
              `ai-sdk-scaledown/${VERSION}`,
            )
          : await resolve(this.config.headers),
        headers,
      ),
      body: {
        model: this.modelId,
        messages: [{ role: 'user', content: inputText }],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'extraction',
            schema: { type: 'object', properties },
          },
        },
        threshold: extractionOptions?.threshold,
        context_chars: 0,
        ...document,
      },
      abortSignal,
      fetch: this.config.fetch,
      failedResponseHandler: scaledownFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        scaledownExtractionResponseSchema,
      ),
    });
    const content = await parseJSON({
      text: value.choices[0].message.content,
      schema: scaledownExtractionContentSchema,
    });

    return {
      answers: Object.fromEntries(
        Object.entries(fields).map(
          ([id, field]): [string, ExtractionModelV4Answer] => {
            const matches = content.entities.filter(
              entity => entity.type === id,
            );
            if (field.type === 'list') {
              return [
                id,
                {
                  type: 'list',
                  value: matches.map(entity => entity.text),
                  items: matches.map(entity => ({
                    confidence: entity.confidence,
                    source: convertScaleDownExtractionSource(
                      entity,
                      state,
                      content.ocr_text,
                    ),
                  })),
                },
              ];
            }
            const match = matches.reduce<(typeof matches)[number] | undefined>(
              (best, entity) =>
                best == null || entity.confidence > best.confidence
                  ? entity
                  : best,
              undefined,
            );
            return [
              id,
              {
                type: 'text',
                value: match?.text ?? null,
                confidence: match?.confidence,
                source:
                  match == null
                    ? undefined
                    : convertScaleDownExtractionSource(
                        match,
                        state,
                        content.ocr_text,
                      ),
              },
            ];
          },
        ),
      ),
      usage: {
        inputTokens:
          value.usage?.prompt_tokens ?? content.input_tokens ?? undefined,
        outputTokens: value.usage?.completion_tokens ?? undefined,
      },
      providerMetadata:
        content.ocr_text == null
          ? undefined
          : { scaledown: { ocrText: content.ocr_text } },
      warnings: Object.entries({
        referenceDate,
        maxOutputTokens,
        reasoning,
      }).flatMap(([feature, setting]) =>
        setting == null ? [] : [{ type: 'unsupported' as const, feature }],
      ),
      response: {
        id: value.id ?? undefined,
        timestamp:
          value.created == null ? undefined : new Date(value.created * 1000),
        modelId: value.model ?? this.modelId,
        headers: responseHeaders,
        body: rawValue,
      },
    };
  }
}
