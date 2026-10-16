import {
  InvalidArgumentError,
  UnsupportedFunctionalityError,
  type Experimental_DecisionModelV4 as DecisionModelV4,
  type Experimental_DecisionModelV4Answer as DecisionModelV4Answer,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createJsonResponseHandler,
  generateId,
  loadApiKey,
  parseProviderOptions,
  postJsonToApi,
  postFormDataToApi,
  resolve,
  serializeModelOptions,
  withUserAgentSuffix,
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
  type FetchFunction,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import {
  typesafeDecisionResponseSchema,
  typesafeFailedResponseHandler,
} from './typesafe-ai-decision-api';
import { VERSION } from './version';
import { typesafeAiFilePartProviderOptions } from './typesafe-ai-file-part-options';
import { typesafeAiDecisionModelOptions } from './typesafe-ai-decision-model-options';

export type TypeSafeAiDecisionModelId =
  | 'jev-1.13.0'
  | 'jev-1.14.0'
  | 'jev-latest'
  | 'jev-preview'
  | (string & {});

type TypeSafeAiDecisionModelConfig = {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
};

export class DecisionTypeSafeAiModel implements DecisionModelV4 {
  readonly specificationVersion = 'v4';
  readonly supportedQuestionTypes = [
    'choice',
    'score',
    'boolean',
    'box',
  ] as const;

  constructor(
    readonly modelId: TypeSafeAiDecisionModelId,
    private readonly config: TypeSafeAiDecisionModelConfig,
  ) {}

  get provider() {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: DecisionTypeSafeAiModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: TypeSafeAiDecisionModelId;
    config: TypeSafeAiDecisionModelConfig;
  }) {
    return new DecisionTypeSafeAiModel(options.modelId, options.config);
  }

  /** @deprecated Use `doDecide` instead. */
  doEvaluate(options: Parameters<DecisionModelV4['doDecide']>[0]) {
    return this.doDecide(options);
  }

  async doDecide({
    state,
    questions,
    headers,
    abortSignal,
    providerOptions,
  }: Parameters<DecisionModelV4['doDecide']>[0]): Promise<
    Awaited<ReturnType<DecisionModelV4['doDecide']>>
  > {
    for (const [id, question] of Object.entries(questions)) {
      if (
        question.type === 'choice' &&
        Object.keys(question.criteria).length > 255
      ) {
        throw new InvalidArgumentError({
          argument: `questions.${id}.criteria`,
          message: 'TypeSafe Choice questions support at most 255 options.',
        });
      }
      if (question.type === 'score' && question.criteria.length > 10) {
        throw new InvalidArgumentError({
          argument: `questions.${id}.criteria`,
          message: 'TypeSafe Score questions support at most 10 levels.',
        });
      }
    }

    const typesafeOptions = await parseProviderOptions({
      provider: 'typesafe',
      providerOptions,
      schema: typesafeAiDecisionModelOptions,
    });
    const warnings: SharedV4Warning[] = Object.keys(
      providerOptions?.typesafe ?? {},
    )
      .filter(option => option !== 'longContext')
      .map(option => ({
        type: 'unsupported',
        feature: `providerOptions.typesafe.${option}`,
      }));
    const assets: Record<string, { type: 'image'; part: string }> =
      Object.create(null); // don't inherit from Object.prototype
    const imageParts: { name: string; blob: Blob; filename: string }[] = [];
    const stateStrings = state.flatMap(part =>
      part.type === 'text'
        ? [part.text]
        : part.type === 'json'
          ? jsonStrings(part.value)
          : [],
    );
    const stateParts = (
      await Promise.all(
        state.map(async (part, index) => {
          if (part.type !== 'file') {
            return part;
          }
          if (part.data.type !== 'data') {
            throw new UnsupportedFunctionalityError({
              functionality: `TypeSafe AI decision file input: ${part.mediaType} (${part.data.type})`,
            });
          }
          const mediaType = part.mediaType;
          if (mediaType !== 'image/png' && mediaType !== 'image/jpeg') {
            throw new UnsupportedFunctionalityError({
              functionality: `TypeSafe AI decision image media type: ${part.mediaType}`,
            });
          }
          const fileOptions = await parseProviderOptions({
            provider: 'typesafe',
            providerOptions: part.providerOptions,
            schema: typesafeAiFilePartProviderOptions,
          });
          if (
            fileOptions?.insertReference === false &&
            fileOptions.reference === undefined
          ) {
            throw new InvalidArgumentError({
              argument: 'providerOptions.typesafe.reference',
              message:
                'TypeSafe images with insertReference: false need an explicit reference.',
            });
          }
          // Default to random IDs to avoid accidental text matches
          // as TypeSafe recommends as the safest option.
          const reference = fileOptions?.reference ?? generateId();
          const insertReference =
            fileOptions?.insertReference ??
            !stateStrings.some(text => text.includes(reference));
          if (assets[reference] !== undefined) {
            throw new InvalidArgumentError({
              argument: 'providerOptions.typesafe.reference',
              message: `Duplicate TypeSafe image reference: ${reference}`,
            });
          }
          const partName = `image-${index}`;
          assets[reference] = { type: 'image', part: partName };
          imageParts.push({
            name: partName,
            blob: new Blob(
              [
                (typeof part.data.data === 'string'
                  ? convertBase64ToUint8Array(part.data.data)
                  : part.data.data) as BlobPart,
              ],
              { type: mediaType },
            ),
            filename:
              part.filename ??
              `${partName}.${mediaType === 'image/png' ? 'png' : 'jpeg'}`,
          });
          return insertReference
            ? { type: 'text' as const, text: reference }
            : undefined;
        }),
      )
    ).filter(part => part !== undefined);
    const requestState =
      stateParts.length === 1 && stateParts[0].type === 'json'
        ? stateParts[0].value
        : stateParts
            .map(part =>
              part.type === 'text' ? part.text : JSON.stringify(part.value),
            )
            .join('\n');
    const hasImages = Object.keys(assets).length > 0;
    const modelHeaders =
      this.config.headers === undefined
        ? withUserAgentSuffix(
            {
              Authorization: `Bearer ${loadApiKey({ apiKey: undefined, environmentVariableName: 'TYPESAFE_AI_API_KEY', description: 'TypeSafe' })}`,
            },
            `ai-sdk-typesafe-ai/${VERSION}`,
          )
        : await resolve(this.config.headers);
    const body = {
      model: this.modelId,
      state: requestState,
      ...(hasImages && { assets }),
      questions: Object.fromEntries(
        Object.entries(questions).map(([id, question]) => [
          id,
          question.type === 'boolean'
            ? { ...question, type: 'noul' }
            : question.type === 'box'
              ? { type: 'box', instructions: question.instructions }
              : question,
        ]),
      ),
    };
    const requestOptions = {
      url: `${this.config.baseURL}/systemone`,
      headers: combineHeaders(
        modelHeaders,
        hasImages ||
          Object.values(questions).some(question => question.type === 'box')
          ? { 'TypeSafe-Danger-Zone-Images': 'true' }
          : undefined,
        typesafeOptions?.longContext
          ? { 'TypeSafe-Danger-Zone-Long-Context': 'true' }
          : undefined,
        headers,
      ),
      abortSignal,
      fetch: this.config.fetch,
      failedResponseHandler: typesafeFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        typesafeDecisionResponseSchema,
      ),
    };
    let formData: FormData | undefined;
    if (hasImages) {
      formData = new FormData();
      formData.append(
        'request',
        new Blob([JSON.stringify(body)], { type: 'application/json' }),
        'request.json',
      );
      for (const { name, blob, filename } of imageParts) {
        formData.append(name, blob, filename);
      }
    }
    const {
      value: response,
      rawValue,
      responseHeaders,
    } = formData !== undefined
      ? await postFormDataToApi({ ...requestOptions, formData })
      : await postJsonToApi({ ...requestOptions, body });

    const confidence = Object.fromEntries(
      Object.entries(response.answers).flatMap(([id, answer]) =>
        answer.type !== 'noul' && answer.confidence != null
          ? [[id, answer.confidence]]
          : [],
      ),
    );

    return {
      answers: Object.fromEntries(
        Object.entries(response.answers).map(
          ([id, answer]): [string, DecisionModelV4Answer] => {
            switch (answer.type) {
              case 'box':
                return [id, { type: 'box', box: answer.box }];
              case 'noul':
                return [id, { type: 'boolean', probability: answer.noul }];
              case 'choice':
                return [
                  id,
                  {
                    type: 'choice',
                    choice: answer.choice,
                    probabilities: answer.probabilities,
                  },
                ];
              case 'score':
                return [
                  id,
                  {
                    type: 'score',
                    score: answer.score,
                    probabilities: answer.probabilities,
                  },
                ];
            }
          },
        ),
      ),
      usage: {
        inputTokens: response.usage?.input_tokens ?? undefined,
        outputTokens: response.usage?.output_tokens ?? undefined,
      },
      // The API rounds displayed probabilities and scores to two decimal places.
      rounding: { probabilityDecimals: 2, scoreDecimals: 2 },
      warnings,
      providerMetadata: { typesafe: { confidence } },
      response: {
        modelId: response.model ?? this.modelId,
        headers: responseHeaders,
        body: rawValue,
      },
    };
  }
}

function jsonStrings(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(jsonStrings);
  }
  if (value !== null && typeof value === 'object') {
    return Object.values(value).flatMap(jsonStrings);
  }
  return [];
}
