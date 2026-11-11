import {
  InvalidArgumentError,
  UnsupportedFunctionalityError,
  type Experimental_DecisionModelV4 as DecisionModelV4,
  type Experimental_DecisionModelV4Answer as DecisionModelV4Answer,
  type Experimental_DecisionModelV4Input as DecisionModelV4Input,
  type Experimental_DecisionModelV4Question as DecisionModelV4Question,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonResponseHandler,
  loadApiKey,
  parseProviderOptions,
  postJsonToApi,
  resolve,
  serializeModelOptions,
  withUserAgentSuffix,
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
  type FetchFunction,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import {
  zirnayDecisionResponseSchema,
  zirnayFailedResponseHandler,
} from './zirnay-decision-api';
import {
  zirnayDecisionModelOptions,
  type ZirnayDecisionModelId,
  type ZirnayDecisionProviderMetadata,
} from './zirnay-decision-model-options';
import { VERSION } from './version';

export type ZirnayDecisionModelConfig = {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
};

export class DecisionZirnayModel implements DecisionModelV4 {
  readonly specificationVersion = 'v4';
  readonly supportedQuestionTypes = ['choice', 'score', 'boolean'] as const;

  constructor(
    readonly modelId: ZirnayDecisionModelId,
    private readonly config: ZirnayDecisionModelConfig,
  ) {}

  get provider() {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: DecisionZirnayModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: ZirnayDecisionModelId;
    config: ZirnayDecisionModelConfig;
  }) {
    return new DecisionZirnayModel(options.modelId, options.config);
  }

  /** @deprecated Use `doDecide` instead. */
  doEvaluate(options: Parameters<DecisionModelV4['doDecide']>[0]) {
    return this.doDecide(options);
  }

  async doDecide({
    state,
    questions,
    maxOutputTokens,
    reasoning,
    headers,
    abortSignal,
    providerOptions,
  }: Parameters<DecisionModelV4['doDecide']>[0]): Promise<
    Awaited<ReturnType<DecisionModelV4['doDecide']>>
  > {
    const questionEntries = Object.entries(questions);
    if (questionEntries.length === 0) {
      throw new InvalidArgumentError({
        argument: 'questions',
        message: 'Zirnay Decisions requires at least one question.',
      });
    }

    for (const [id, question] of questionEntries) {
      if (
        question.type === 'choice' &&
        Object.keys(question.criteria).length === 0
      ) {
        throw new InvalidArgumentError({
          argument: `questions.${id}.criteria`,
          message: 'Zirnay Choice questions require at least one option.',
        });
      }
      if (
        question.type === 'score' &&
        (question.criteria.length === 0 ||
          question.criteria.some(level => level == null))
      ) {
        throw new InvalidArgumentError({
          argument: `questions.${id}.criteria`,
          message: 'Zirnay Score questions require non-null rubric levels.',
        });
      }
    }

    const zirnayOptions = await parseProviderOptions({
      provider: 'zirnay',
      providerOptions,
      schema: zirnayDecisionModelOptions,
    });

    const warnings: SharedV4Warning[] = Object.keys(
      providerOptions?.zirnay ?? {},
    )
      .filter(
        option =>
          ![
            'constraints',
            'arbitrationStrategy',
            'decisionType',
            'accountId',
          ].includes(option),
      )
      .map(option => ({
        type: 'unsupported',
        feature: `providerOptions.zirnay.${option}`,
      }));

    if (maxOutputTokens != null) {
      warnings.push({ type: 'unsupported', feature: 'maxOutputTokens' });
    }
    if (reasoning != null) {
      warnings.push({ type: 'unsupported', feature: 'reasoning' });
    }

    for (const part of state) {
      if (part.type === 'file') {
        throw new UnsupportedFunctionalityError({
          functionality: 'Zirnay Decisions file input',
        });
      }
    }

    let inputObject: Record<string, unknown>;
    if (state.length === 1 && state[0].type === 'json') {
      const val = state[0].value;
      inputObject =
        typeof val === 'object' && val !== null && !Array.isArray(val)
          ? (val as Record<string, unknown>)
          : { data: val };
    } else if (state.length === 1 && state[0].type === 'text') {
      inputObject = { text: state[0].text };
    } else {
      inputObject = {
        stateParts: state.map(p => {
          if (p.type === 'text') {
            return { text: p.text };
          }
          if (p.type === 'json') {
            return { json: p.value };
          }
          return {};
        }),
      };
    }

    const modelHeaders =
      this.config.headers === undefined
        ? withUserAgentSuffix(
            {
              Authorization: `Bearer ${loadApiKey({ apiKey: undefined, environmentVariableName: 'ZIRNAY_API_KEY', description: 'Zirnay' })}`,
            },
            `ai-sdk-zirnay/${VERSION}`,
          )
        : await resolve(this.config.headers);

    const requestHeaders = combineHeaders(
      modelHeaders,
      zirnayOptions?.accountId
        ? { 'X-Zirnay-Account-ID': zirnayOptions.accountId }
        : undefined,
      headers,
    );

    const evaluateQuestion = async (
      questionId: string,
      question: DecisionModelV4Question,
    ) => {
      let decisionType = zirnayOptions?.decisionType ?? 'categorical_choice';
      let candidates: Array<{ id: string; label?: string }>;
      const instructions =
        question.instructions != null
          ? toText(question.instructions)
          : undefined;

      switch (question.type) {
        case 'choice':
          candidates = Object.entries(question.criteria).map(([id, desc]) => ({
            id,
            ...(desc != null ? { label: toText(desc) } : {}),
          }));
          break;
        case 'boolean':
          decisionType = zirnayOptions?.decisionType ?? 'categorical_choice';
          candidates = [
            {
              id: 'true',
              label: toText(
                question.criteria?.true ?? question.instructions ?? 'True',
              ),
            },
            {
              id: 'false',
              label: toText(question.criteria?.false ?? 'False'),
            },
          ];
          break;
        case 'score':
          decisionType = zirnayOptions?.decisionType ?? 'ordinal_score';
          candidates = question.criteria.map((desc, idx) => ({
            id: String(idx),
            ...(desc != null ? { label: toText(desc) } : {}),
          }));
          break;
        default:
          throw new UnsupportedFunctionalityError({
            functionality: `Question type: ${(question as { type: string }).type}`,
          });
      }

      const constraintsPayload = zirnayOptions?.constraints
        ? {
            ...(zirnayOptions.constraints.maxEceThreshold !== undefined && {
              max_ece_threshold: zirnayOptions.constraints.maxEceThreshold,
            }),
            ...(zirnayOptions.constraints.minConfidence !== undefined && {
              min_confidence: zirnayOptions.constraints.minConfidence,
            }),
          }
        : undefined;

      const input =
        instructions != null
          ? {
              ...inputObject,
              instruction: instructions,
            }
          : inputObject;

      const body = {
        model: this.modelId,
        input,
        ...(instructions != null && { instructions }),
        decision_type: decisionType,
        candidates,
        ...(constraintsPayload && { constraints: constraintsPayload }),
        ...(zirnayOptions?.arbitrationStrategy && {
          arbitration_strategy: zirnayOptions.arbitrationStrategy,
        }),
      };

      const {
        value: response,
        rawValue,
        responseHeaders,
      } = await postJsonToApi({
        url: `${this.config.baseURL}/decisions`,
        headers: requestHeaders,
        body,
        abortSignal,
        fetch: this.config.fetch,
        failedResponseHandler: zirnayFailedResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(
          zirnayDecisionResponseSchema,
        ),
      });

      return {
        questionId,
        question,
        response,
        rawValue,
        responseHeaders,
      };
    };

    const results = await Promise.all(
      questionEntries.map(([qId, q]) => evaluateQuestion(qId, q)),
    );

    const answers: Record<string, DecisionModelV4Answer> = {};
    const metadata: ZirnayDecisionProviderMetadata = {
      confidence: {},
      calibratedProbability: {},
      marginOverSecond: {},
      candidateScores: {},
      auditTrail: {},
      telemetry: {},
    };

    let totalInputTokens: number | undefined;
    let totalOutputTokens: number | undefined;

    for (const { questionId, question, response } of results) {
      if (response.usage?.input_tokens != null) {
        totalInputTokens =
          (totalInputTokens ?? 0) + response.usage.input_tokens;
      }
      if (response.usage?.output_tokens != null) {
        totalOutputTokens =
          (totalOutputTokens ?? 0) + response.usage.output_tokens;
      }

      const decision = response.decision;
      if (decision?.confidence != null) {
        metadata.confidence[questionId] = decision.confidence;
      }
      if (decision?.calibrated_probability != null) {
        metadata.calibratedProbability[questionId] =
          decision.calibrated_probability;
      }
      if (decision?.margin_over_second != null) {
        metadata.marginOverSecond[questionId] = decision.margin_over_second;
      }
      if (response.candidate_scores) {
        metadata.candidateScores[questionId] = response.candidate_scores.map(
          cs => ({
            candidateId: cs.candidate_id,
            rawLogit: cs.raw_logit,
            calibratedProb: cs.calibrated_prob,
            utilityScore: cs.utility_score,
          }),
        );
      }
      if (response.audit_trail) {
        metadata.auditTrail[questionId] = {
          reasoningCode: response.audit_trail.reasoning_code,
          explanation: response.audit_trail.explanation,
          citations: response.audit_trail.citations?.map(c => ({
            source: c.source,
            id: c.id,
            relevance: c.relevance,
          })),
        };
      }
      if (response.telemetry) {
        metadata.telemetry[questionId] = {
          latencyMs: response.telemetry.latency_ms,
          expectedCalibrationError:
            response.telemetry.expected_calibration_error,
          permutationRounds: response.telemetry.permutation_rounds,
          dataRetention: response.telemetry.data_retention,
        };
      }

      if (decision?.selected_candidate_id == null) {
        answers[questionId] = { type: 'refusal' };
        continue;
      }

      const candidateScoresMap = response.candidate_scores
        ? Object.fromEntries(
            response.candidate_scores
              .filter(cs => cs.calibrated_prob != null)
              .map(cs => [cs.candidate_id, cs.calibrated_prob as number]),
          )
        : undefined;

      switch (question.type) {
        case 'choice': {
          answers[questionId] = {
            type: 'choice',
            choice: decision.selected_candidate_id,
            ...(candidateScoresMap && {
              probabilities: candidateScoresMap,
            }),
          };
          break;
        }
        case 'boolean': {
          let prob: number;
          if (candidateScoresMap?.['true'] != null) {
            prob = candidateScoresMap['true'];
          } else if (candidateScoresMap?.['false'] != null) {
            prob = 1 - candidateScoresMap['false'];
          } else if (decision.selected_candidate_id === 'true') {
            prob = decision.calibrated_probability ?? 1;
          } else if (decision.selected_candidate_id === 'false') {
            prob =
              decision.calibrated_probability != null
                ? 1 - decision.calibrated_probability
                : 0;
          } else {
            prob = 0.5;
          }
          answers[questionId] = {
            type: 'boolean',
            probability: Math.max(0, Math.min(1, prob)),
          };
          break;
        }
        case 'score': {
          let scoreVal = Number(decision.selected_candidate_id);
          if (candidateScoresMap) {
            const sum = Object.entries(candidateScoresMap).reduce(
              (acc, [idx, p]) => acc + Number(idx) * p,
              0,
            );
            if (Number.isFinite(sum)) {
              scoreVal = sum;
            }
          }
          answers[questionId] = {
            type: 'score',
            score: scoreVal,
            ...(candidateScoresMap && {
              probabilities: candidateScoresMap,
            }),
          };
          break;
        }
      }
    }

    const firstResult = results[0];

    return {
      answers,
      usage:
        totalInputTokens != null || totalOutputTokens != null
          ? {
              inputTokens: totalInputTokens,
              outputTokens: totalOutputTokens,
            }
          : undefined,
      rounding: { probabilityDecimals: 3, scoreDecimals: 3 },
      warnings,
      providerMetadata: { zirnay: metadata },
      response: {
        id: firstResult.response.id ?? undefined,
        modelId: firstResult.response.model ?? this.modelId,
        headers: firstResult.responseHeaders,
        body: firstResult.rawValue,
      },
    };
  }
}

function toText(input: DecisionModelV4Input): string {
  return typeof input === 'string' ? input : JSON.stringify(input);
}
