import {
  Experimental_EvaluationUnsupportedQuestionTypeError as EvaluationUnsupportedQuestionTypeError,
  InvalidArgumentError,
  InvalidResponseDataError,
  type EmbeddingModelV4,
  type Experimental_EvaluationModelV4 as EvaluationModelV4,
  type Experimental_EvaluationModelV4CallOptions as EvaluationModelV4CallOptions,
  type Experimental_EvaluationModelV4Result as EvaluationModelV4Result,
  type SharedV4ProviderOptions,
} from '@ai-sdk/provider';
import { WORKFLOW_DESERIALIZE, WORKFLOW_SERIALIZE } from '@workflow/serde';
import { EMBEDDING_MODEL_MAX_INPUT_BYTES_PER_CALL } from './embedding-model-capabilities';

/** Adapts embedding similarity to Choice evaluation. Does not estimate probabilities. */
export class EvaluationEmbeddingModel implements EvaluationModelV4 {
  readonly specificationVersion = 'v4';
  readonly supportedQuestionTypes = ['choice'] as const;
  readonly provider: string;
  private readonly model: EmbeddingModelV4;
  private readonly inputPrefix: string;
  private readonly providerOptions: SharedV4ProviderOptions;
  private cacheContext?: string;
  private cache = new Map<string, number[]>();

  constructor({
    model,
    provider = `${model.provider}.evaluation`,
    inputPrefix = '',
    providerOptions = {},
  }: {
    model: EmbeddingModelV4;
    provider?: string;
    inputPrefix?: string;
    providerOptions?: SharedV4ProviderOptions;
  }) {
    if (model.specificationVersion !== 'v4') {
      throw new InvalidArgumentError({
        argument: 'model',
        message:
          'Embedding evaluation requires an EmbeddingModelV4 implementation.',
      });
    }
    this.model = model;
    this.provider = provider;
    this.inputPrefix = inputPrefix;
    this.providerOptions = providerOptions;
  }

  get modelId() {
    return this.model.modelId;
  }

  static [WORKFLOW_SERIALIZE](model: EvaluationEmbeddingModel) {
    // Only configuration is serialized, never cached customer criteria or vectors.
    return {
      model: model.model,
      provider: model.provider,
      inputPrefix: model.inputPrefix,
      providerOptions: model.providerOptions,
    };
  }

  static [WORKFLOW_DESERIALIZE](
    options: ConstructorParameters<typeof EvaluationEmbeddingModel>[0],
  ) {
    return new EvaluationEmbeddingModel(options);
  }

  async doEvaluate({
    state,
    questions,
    abortSignal,
    headers,
    providerOptions = {},
  }: EvaluationModelV4CallOptions): Promise<EvaluationModelV4Result> {
    abortSignal?.throwIfAborted();
    const entries = Object.entries(questions).map(([id, question]) => {
      if (question.type !== 'choice') {
        throw new EvaluationUnsupportedQuestionTypeError({
          questionId: id,
          questionType: question.type,
          provider: this.provider,
          modelId: this.modelId,
        });
      }
      if (Object.keys(question.criteria).length === 0) {
        throw new InvalidArgumentError({
          argument: `questions.${id}.criteria`,
          message: 'Choice requires at least one option.',
        });
      }
      return [id, question] as const;
    });
    if (entries.length === 0) {
      throw new InvalidArgumentError({
        argument: 'questions',
        message: 'Evaluation requires at least one question.',
      });
    }

    const mergedOptions = { ...this.providerOptions };
    for (const [provider, options] of Object.entries(providerOptions)) {
      mergedOptions[provider] = { ...mergedOptions[provider], ...options };
    }
    const context = JSON.stringify({ headers, providerOptions: mergedOptions });
    if (context !== this.cacheContext) {
      this.cacheContext = context;
      this.cache = new Map();
    }
    // Capture this context's cache so concurrent calls with different options
    // cannot put incompatible embeddings into each other's caches.
    const cache = this.cache;
    const encode = (instructions: unknown, content: unknown) =>
      `${this.inputPrefix}${JSON.stringify({ instructions, content })}`;
    const rubrics = entries.map(([id, question]) => ({
      id,
      state: encode(question.instructions, state),
      criteria: Object.entries(question.criteria).map(
        ([label, description]) => ({
          label,
          text: encode(question.instructions, description ?? label),
        }),
      ),
    }));
    const criteriaTexts = new Set(
      rubrics.flatMap(rubric =>
        rubric.criteria.map(criterion => criterion.text),
      ),
    );
    const vectors = new Map<string, number[]>();
    for (const text of criteriaTexts) {
      const cached = cache.get(text);
      if (cached != null) vectors.set(text, cached);
    }
    // States are always embedded afresh. Deduplicate inputs within this call.
    const values = [
      ...new Set(
        rubrics.flatMap(rubric => [
          rubric.state,
          ...rubric.criteria.map(criterion => criterion.text),
        ]),
      ),
    ].filter(
      text =>
        !vectors.has(text) || rubrics.some(rubric => rubric.state === text),
    );
    const maxValues = (await this.model.maxEmbeddingsPerCall) ?? Infinity;
    const maxBytes =
      (await (
        this.model as EmbeddingModelV4 & {
          [EMBEDDING_MODEL_MAX_INPUT_BYTES_PER_CALL]?:
            | number
            | PromiseLike<number | undefined>;
        }
      )[EMBEDDING_MODEL_MAX_INPUT_BYTES_PER_CALL]) ?? Infinity;
    if (
      !(maxValues > 0) ||
      (Number.isFinite(maxValues) && !Number.isInteger(maxValues)) ||
      !(maxBytes > 0)
    ) {
      throw new InvalidArgumentError({
        argument: 'model',
        message: 'Embedding request limits must be positive.',
      });
    }
    const batches: string[][] = [];
    let batch: string[] = [];
    let batchBytes = 0;
    const encoder = new TextEncoder();
    for (const value of values) {
      const bytes = encoder.encode(value).length;
      if (
        batch.length > 0 &&
        (batch.length >= maxValues || batchBytes + bytes > maxBytes)
      ) {
        batches.push(batch);
        batch = [];
        batchBytes = 0;
      }
      batch.push(value);
      batchBytes += bytes;
    }
    if (batch.length > 0) batches.push(batch);

    let dimensions = vectors.values().next().value?.length;
    let inputTokens: number | undefined = 0;
    const warnings: EvaluationModelV4Result['warnings'] = [];
    let response: EvaluationModelV4Result['response'];
    let providerMetadata: EvaluationModelV4Result['providerMetadata'];
    try {
      // Sequential requests also support embedding providers without parallel calls.
      // Retry ownership stays with evaluate; this adapter does not retry.
      for (const values of batches) {
        abortSignal?.throwIfAborted();
        const result = await this.model.doEmbed({
          values,
          abortSignal,
          headers,
          providerOptions: mergedOptions,
        });
        abortSignal?.throwIfAborted();
        if (result.embeddings.length !== values.length) {
          throw new InvalidResponseDataError({
            data: result.embeddings,
            message:
              'Embedding evaluation received an unexpected number of vectors.',
          });
        }
        for (let index = 0; index < values.length; index++) {
          const vector = result.embeddings[index];
          dimensions ??= vector.length;
          const magnitude = vector.reduce(
            (length, value) => Math.hypot(length, value),
            0,
          );
          if (
            vector.length === 0 ||
            vector.length !== dimensions ||
            !vector.every(Number.isFinite) ||
            !Number.isFinite(magnitude) ||
            magnitude === 0
          ) {
            throw new InvalidResponseDataError({
              data: vector,
              message:
                'Embedding evaluation requires finite, nonzero vectors of consistent dimensions.',
            });
          }
          vectors.set(
            values[index],
            vector.map(value => value / magnitude),
          );
        }
        inputTokens =
          inputTokens != null && result.usage != null
            ? inputTokens + result.usage.tokens
            : undefined;
        warnings.push(...result.warnings);
        response = result.response;
        providerMetadata = result.providerMetadata;
      }
      const answers = Object.fromEntries(
        rubrics.map(rubric => {
          const stateVector = vectors.get(rubric.state)!;
          let choice = rubric.criteria[0].label;
          let bestSimilarity = -Infinity;
          for (const criterion of rubric.criteria) {
            const criterionVector = vectors.get(criterion.text)!;
            const similarity = stateVector.reduce(
              (sum, value, index) => sum + value * criterionVector[index],
              0,
            );
            // Strict comparison makes exact ties select the first criteria entry.
            if (similarity > bestSimilarity) {
              bestSimilarity = similarity;
              choice = criterion.label;
            }
          }
          return [rubric.id, { type: 'choice' as const, choice }];
        }),
      );
      // Commit only after every request succeeds. Bound storage to 256 criteria;
      // never retain state-only inputs or serialize the cache into workflows.
      for (const text of criteriaTexts) {
        cache.delete(text);
        cache.set(text, vectors.get(text)!);
        if (cache.size > 256) cache.delete(cache.keys().next().value!);
      }
      return {
        answers,
        usage: { inputTokens, outputTokens: 0 },
        warnings,
        response,
        providerMetadata,
      };
    } catch (error) {
      cache.clear();
      throw error;
    }
  }
}
