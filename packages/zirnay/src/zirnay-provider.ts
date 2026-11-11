import {
  APICallError,
  NoSuchModelError,
  type Experimental_DecisionModelV4 as DecisionModelV4,
  type ProviderV4,
} from '@ai-sdk/provider';
import {
  resolveWith,
  resolve,
  type Resolvable,
  loadApiKey,
  loadOptionalSetting,
  withoutTrailingSlash,
  withUserAgentSuffix,
  postJsonToApi,
  createJsonResponseHandler,
  combineHeaders,
  zodSchema,
  extractResponseHeaders,
  isAbortError,
  type FetchFunction,
  type ResponseHandler,
} from '@ai-sdk/provider-utils';
import * as z from 'zod/v4';
import { DecisionZirnayModel } from './zirnay-decision-model';
import type { ZirnayDecisionModelId } from './zirnay-decision-model-options';
import {
  zirnayFailedResponseHandler,
  zirnayFeedbackResponseSchema,
} from './zirnay-decision-api';
import { VERSION } from './version';

export interface RegisterModelOptions {
  teamSlug?: string;
  team?: string;
  name: string;
  slug: string;
  engineType: string;
  version?: string;
  p99LatencyBudgetMs?: number;
  storageProvider?: string;
  classes?: string[];
  description?: string;
  query?: {
    type: 'choice' | 'score' | 'boolean' | string;
    target?: string;
    options?: string[];
    fallback_option?: string;
  };
  featuresSchema?: Record<string, unknown>;
  calibration?: {
    method?: string;
    temperature?: number;
    targetEce?: number;
  };
  sla?: {
    p99LatencyBudgetMs?: number;
    hardTimeoutMs?: number;
  };
  headers?: Record<string, string>;
  abortSignal?: AbortSignal;
}

/** @deprecated Use `RegisterModelOptions` instead. */
export type CreateModelOptions = RegisterModelOptions;

export interface UpdateModelConfigOptions {
  teamSlug?: string;
  team?: string;
  modelSlug?: string;
  model?: string;
  config: Record<string, unknown>;
  headers?: Record<string, string>;
  abortSignal?: AbortSignal;
}

export interface DirectDecideOptions {
  teamSlug?: string;
  team?: string;
  modelSlug?: string;
  model?: string;
  rawText?: string;
  jsonState?: Record<string, unknown>;
  query?: {
    type?: string;
    target?: string;
    options?: string[];
  };
  features?: Record<string, unknown>;
  options?: {
    checkpointId?: string;
    explain?: boolean;
  };
  headers?: Record<string, string>;
  abortSignal?: AbortSignal;
}

export interface DirectDecideResponse {
  requestId?: string;
  decision?: string;
  confidence?: number;
  probabilities?: Record<string, number>;
  scoreValue?: number;
  checkpointId?: string;
  modelType?: string;
  executionNanos?: number;
  timestamp?: string;
}

export interface SubmitFeedbackOptions {
  model?: string;
  teamSlug?: string;
  team?: string;
  modelSlug?: string;
  requestId?: string;
  decisionId?: string;
  actualOutcome?: string | number | boolean;
  target?: string | number | boolean;
  feedbackType?:
    | 'CORRECTION'
    | 'AFFIRMATION'
    | 'ESCALATION'
    | 'override'
    | (string & {});
  reviewer?:
    | string
    | {
        reviewerId?: string;
        reviewerRole?: string;
        notes?: string;
      };
  metadata?: Record<string, unknown>;
  headers?: Record<string, string>;
  abortSignal?: AbortSignal;
}

export interface SubmitFeedbackResponse {
  feedbackId?: string | null;
  requestId?: string | null;
  modelSlug?: string | null;
  predictedOutcome?: string | null;
  actualOutcome?: string | number | boolean | null;
  feedbackType?: string | null;
  cacheCleared?: boolean | null;
  ingestedToBuffer?: boolean | null;
  createdAt?: string | null;
}

export interface UploadDatasetOptions {
  teamSlug?: string;
  team?: string;
  modelSlug?: string;
  model?: string;
  filename?: string;
  datasetName?: string;
  data?: string;
  file?: string | Blob;
  format?: {
    dataset_name?: string;
    description?: string;
    target_field?: string;
    fields?: Array<{
      name: string;
      datatype:
        | 'number'
        | 'float'
        | 'integer'
        | 'string'
        | 'boolean'
        | 'datetime'
        | 'category';
      role?: 'feature' | 'target' | 'timestamp' | 'metadata' | 'id';
      nullable?: boolean;
      description?: string;
    }>;
  };
  validation?: 'strict' | 'lenient';
  maxRejections?: number;
  headers?: Record<string, string>;
  abortSignal?: AbortSignal;
}

export interface TriggerTrainingOptions {
  teamSlug?: string;
  team?: string;
  modelSlug?: string;
  model?: string;
  datasetId: string;
  hyperparameters?: {
    epochs?: number;
    learningRate?: number;
    batchSize?: number;
    batch_size?: number;
    learning_rate?: number;
  };
  headers?: Record<string, string>;
  abortSignal?: AbortSignal;
}

export interface ActivateCheckpointOptions {
  teamSlug?: string;
  team?: string;
  modelSlug?: string;
  model?: string;
  checkpointId: string;
  headers?: Record<string, string>;
  abortSignal?: AbortSignal;
}

export interface ZirnayProvider extends ProviderV4 {
  decisionModel(modelId: ZirnayDecisionModelId): DecisionModelV4;
  /** @deprecated Use `decisionModel` instead. */
  evaluationModel(modelId: ZirnayDecisionModelId): DecisionModelV4 & {
    doEvaluate: DecisionModelV4['doDecide'];
  };

  /**
   * Register a new model definition on Zirnay (POST /v1/teams/{team_slug}/models).
   */
  registerModel(
    options: RegisterModelOptions,
  ): Promise<Record<string, unknown>>;

  /** @deprecated Use `registerModel` instead. */
  createModel(options: RegisterModelOptions): Promise<Record<string, unknown>>;

  /**
   * Update model configuration or registered dataset format (PATCH /v1/teams/{team_slug}/models/{model_slug}).
   */
  updateModelConfig(
    options: UpdateModelConfigOptions,
  ): Promise<Record<string, unknown>>;

  /**
   * Execute real-time System 1 decision on warm in-memory model checkpoint
   * (POST /v1/teams/{team_slug}/models/{model_slug}/decide).
   */
  directDecide(options: DirectDecideOptions): Promise<DirectDecideResponse>;

  /**
   * Submit Human-in-the-Loop (HITL) feedback, supervisor corrections, or affirmations.
   * Clears the hot route cache and streams records to the retraining buffer.
   */
  submitFeedback(
    options: SubmitFeedbackOptions,
  ): Promise<SubmitFeedbackResponse>;

  /**
   * Upload training dataset to tenant isolated workspace.
   */
  uploadDataset(options: UploadDatasetOptions): Promise<{
    datasetId?: string;
    filename?: string;
    status?: string;
    recordCount?: number;
    sizeBytes?: number;
    sha256?: string;
  }>;

  /**
   * Trigger asynchronous model training using an uploaded dataset.
   */
  triggerTraining(
    options: TriggerTrainingOptions,
  ): Promise<Record<string, unknown>>;

  /**
   * Promote / activate checkpoint in production via zero-downtime hot swap.
   */
  activateCheckpoint(
    options: ActivateCheckpointOptions,
  ): Promise<Record<string, unknown>>;
}

export interface ZirnayProviderSettings {
  /** API key. Defaults to the ZIRNAY_API_KEY environment variable. */
  apiKey?: Resolvable<string>;
  /**
   * Authentication header mode:
   * - 'bearer' (default): Authorization: Bearer <key>
   * - 'x-api-key': X-API-Key: <key>
   * - 'both': sends both headers
   */
  authMode?: 'bearer' | 'x-api-key' | 'both';
  /** Multi-tenant account identifier (X-Zirnay-Account-ID). Defaults to ZIRNAY_ACCOUNT_ID. */
  accountId?: string;
  /**
   * API base URL. Defaults to the ZIRNAY_BASE_URL environment variable,
   * then https://api.zirnay.com/v1.
   */
  baseURL?: string;
  headers?: Record<string, string>;
  fetch?: FetchFunction;
}

export function createZirnay(
  options: ZirnayProviderSettings = {},
): ZirnayProvider {
  const baseURL =
    withoutTrailingSlash(
      loadOptionalSetting({
        settingValue: options.baseURL,
        environmentVariableName: 'ZIRNAY_BASE_URL',
      }),
    ) ?? 'https://api.zirnay.com/v1';

  const accountId = loadOptionalSetting({
    settingValue: options.accountId,
    environmentVariableName: 'ZIRNAY_ACCOUNT_ID',
  });

  const authMode = options.authMode ?? 'bearer';

  const headers = () =>
    resolveWith(options.apiKey, apiKey => {
      const resolvedKey = loadApiKey({
        apiKey,
        environmentVariableName: 'ZIRNAY_API_KEY',
        description: 'Zirnay',
      });
      const authHeaders: Record<string, string> = {};
      if (authMode === 'bearer' || authMode === 'both') {
        authHeaders.Authorization = `Bearer ${resolvedKey}`;
      }
      if (authMode === 'x-api-key' || authMode === 'both') {
        authHeaders['X-API-Key'] = resolvedKey;
      }
      if (accountId) {
        authHeaders['X-Zirnay-Account-ID'] = accountId;
      }
      return withUserAgentSuffix(
        {
          ...authHeaders,
          ...options.headers,
        },
        `ai-sdk-zirnay/${VERSION}`,
      );
    });

  const decisionModel = (modelId: ZirnayDecisionModelId) =>
    new DecisionZirnayModel(modelId, {
      provider: 'zirnay.decision',
      baseURL,
      headers,
      fetch: options.fetch,
    });

  const registerModel = async ({
    teamSlug,
    team: teamAlias,
    name,
    slug,
    engineType,
    version = '1.0.0',
    p99LatencyBudgetMs,
    storageProvider,
    classes,
    description,
    query,
    featuresSchema,
    calibration,
    sla,
    headers: requestHeaders,
    abortSignal,
  }: RegisterModelOptions) => {
    const team = teamSlug ?? teamAlias;
    if (!team) {
      throw new Error('registerModel requires teamSlug (or team).');
    }
    const resolvedBaseHeaders = await resolve(headers());
    const { value: response } = await postJsonToApi({
      url: `${baseURL}/teams/${team}/models`,
      headers: combineHeaders(resolvedBaseHeaders, requestHeaders),
      body: {
        name,
        slug,
        engine_type: engineType,
        version,
        ...(p99LatencyBudgetMs !== undefined && {
          p99_latency_budget_ms: p99LatencyBudgetMs,
        }),
        ...(storageProvider && { storage_provider: storageProvider }),
        ...(classes && { classes }),
        ...(description && { description }),
        ...(query && { query }),
        ...(featuresSchema && { features_schema: featuresSchema }),
        ...(calibration && {
          calibration: {
            method: calibration.method,
            temperature: calibration.temperature,
            target_ece: calibration.targetEce,
          },
        }),
        ...(sla && {
          sla: {
            p99_latency_budget_ms: sla.p99LatencyBudgetMs,
            hard_timeout_ms: sla.hardTimeoutMs,
          },
        }),
      },
      abortSignal,
      fetch: options.fetch,
      failedResponseHandler: zirnayFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        zodSchema(z.record(z.string(), z.unknown())),
      ),
    });
    return response as Record<string, unknown>;
  };

  const patchJsonToApi = async <T>({
    url,
    headers: requestHeaders,
    body,
    failedResponseHandler,
    successfulResponseHandler,
    abortSignal,
    fetch: customFetch = globalThis.fetch,
  }: {
    url: string;
    headers?: Record<string, string | undefined>;
    body: unknown;
    failedResponseHandler: ResponseHandler<APICallError>;
    successfulResponseHandler: ResponseHandler<T>;
    abortSignal?: AbortSignal;
    fetch?: FetchFunction;
  }) => {
    try {
      const response = await customFetch(url, {
        method: 'PATCH',
        headers: withUserAgentSuffix(
          {
            'Content-Type': 'application/json',
            ...requestHeaders,
          },
          `ai-sdk-zirnay/${VERSION}`,
        ),
        body: JSON.stringify(body),
        signal: abortSignal,
      });

      const responseHeaders = extractResponseHeaders(response);

      if (!response.ok) {
        let errorInformation: {
          value: APICallError;
          responseHeaders?: Record<string, string> | undefined;
        };

        try {
          errorInformation = await failedResponseHandler({
            response,
            url,
            requestBodyValues: body,
          });
        } catch (error) {
          if (isAbortError(error)) {
            throw error;
          }
          throw new APICallError({
            message: 'Failed to process error response',
            cause: error,
            statusCode: response.status,
            url,
            responseHeaders,
            requestBodyValues: body,
          });
        }

        throw errorInformation.value;
      }

      return await successfulResponseHandler({
        response,
        url,
        requestBodyValues: body,
      });
    } catch (error) {
      if (isAbortError(error) || error instanceof APICallError) {
        throw error;
      }
      throw new APICallError({
        message: error instanceof Error ? error.message : 'Fetch failed',
        cause: error,
        url,
        requestBodyValues: body,
      });
    }
  };

  const updateModelConfig = async ({
    teamSlug,
    team: teamAlias,
    modelSlug,
    model: modelAlias,
    config,
    headers: requestHeaders,
    abortSignal,
  }: UpdateModelConfigOptions) => {
    const team = teamSlug ?? teamAlias;
    const mod = modelSlug ?? modelAlias;
    if (!team || !mod) {
      throw new Error(
        'updateModelConfig requires teamSlug and modelSlug (or team and model).',
      );
    }
    const resolvedBaseHeaders = await resolve(headers());
    const { value: response } = await patchJsonToApi({
      url: `${baseURL}/teams/${team}/models/${mod}`,
      headers: combineHeaders(resolvedBaseHeaders, requestHeaders),
      body: config,
      abortSignal,
      fetch: options.fetch,
      failedResponseHandler: zirnayFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        zodSchema(z.record(z.string(), z.unknown())),
      ),
    });
    return response as Record<string, unknown>;
  };

  const directDecide = async ({
    teamSlug,
    team: teamAlias,
    modelSlug,
    model: modelAlias,
    rawText,
    jsonState,
    query,
    features,
    options: decideOpts,
    headers: requestHeaders,
    abortSignal,
  }: DirectDecideOptions): Promise<DirectDecideResponse> => {
    const team = teamSlug ?? teamAlias;
    const mod = modelSlug ?? modelAlias;
    if (!team || !mod) {
      throw new Error(
        'directDecide requires teamSlug and modelSlug (or team and model).',
      );
    }
    const resolvedBaseHeaders = await resolve(headers());
    const { value: response } = await postJsonToApi({
      url: `${baseURL}/teams/${team}/models/${mod}/decide`,
      headers: combineHeaders(resolvedBaseHeaders, requestHeaders),
      body: {
        ...(rawText !== undefined && { raw_text: rawText }),
        ...(jsonState !== undefined && { json_state: jsonState }),
        ...(query && { query }),
        ...(features && { features }),
        ...(decideOpts && {
          options: {
            checkpoint_id: decideOpts.checkpointId,
            explain: decideOpts.explain,
          },
        }),
      },
      abortSignal,
      fetch: options.fetch,
      failedResponseHandler: zirnayFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        zodSchema(
          z.object({
            request_id: z.string().nullish(),
            decision: z.string().nullish(),
            confidence: z.number().nullish(),
            probabilities: z.record(z.string(), z.number()).nullish(),
            score_value: z.number().nullish(),
            checkpoint_id: z.string().nullish(),
            model_type: z.string().nullish(),
            execution_nanos: z.number().nullish(),
            timestamp: z.string().nullish(),
          }),
        ),
      ),
    });

    return {
      requestId: response.request_id ?? undefined,
      decision: response.decision ?? undefined,
      confidence: response.confidence ?? undefined,
      probabilities: response.probabilities ?? undefined,
      scoreValue: response.score_value ?? undefined,
      checkpointId: response.checkpoint_id ?? undefined,
      modelType: response.model_type ?? undefined,
      executionNanos: response.execution_nanos ?? undefined,
      timestamp: response.timestamp ?? undefined,
    };
  };

  const submitFeedback = async ({
    model,
    teamSlug,
    team: teamAlias,
    modelSlug,
    model: modelAlias,
    requestId,
    decisionId,
    actualOutcome,
    target,
    feedbackType = 'CORRECTION',
    reviewer,
    metadata,
    headers: requestHeaders,
    abortSignal,
  }: SubmitFeedbackOptions): Promise<SubmitFeedbackResponse> => {
    let team = teamSlug ?? teamAlias;
    let mod =
      modelSlug ??
      (modelAlias && !modelAlias.includes('/') ? modelAlias : undefined);

    if ((!team || !mod) && model) {
      const parts = model.split('/');
      if (parts.length >= 3) {
        team = team ?? parts[1];
        mod = mod ?? parts[2].split(':')[0];
      } else if (parts.length === 2) {
        team = team ?? parts[0];
        mod = mod ?? parts[1].split(':')[0];
      } else {
        mod = mod ?? parts[0].split(':')[0];
      }
    }

    if (!team || !mod) {
      throw new Error(
        'submitFeedback requires teamSlug and modelSlug (or a qualified model string like "org/team/model:tag").',
      );
    }

    const reqId = requestId ?? decisionId;
    if (!reqId) {
      throw new Error('submitFeedback requires a requestId (or decisionId).');
    }

    const outcome = actualOutcome ?? target;
    if (outcome === undefined) {
      throw new Error(
        'submitFeedback requires actualOutcome (or target ground truth).',
      );
    }

    const fbType = feedbackType === 'override' ? 'CORRECTION' : feedbackType;

    const reviewerPayload =
      typeof reviewer === 'string'
        ? { reviewer_id: reviewer }
        : reviewer
          ? {
              reviewer_id: reviewer.reviewerId,
              reviewer_role: reviewer.reviewerRole,
              notes: reviewer.notes,
            }
          : undefined;

    const resolvedBaseHeaders = await resolve(headers());
    const { value: response } = await postJsonToApi({
      url: `${baseURL}/teams/${team}/models/${mod}/feedback`,
      headers: combineHeaders(resolvedBaseHeaders, requestHeaders),
      body: {
        request_id: reqId,
        actual_outcome: outcome,
        feedback_type: fbType,
        ...(reviewerPayload && { reviewer: reviewerPayload }),
        ...(metadata && { metadata }),
      },
      abortSignal,
      fetch: options.fetch,
      failedResponseHandler: zirnayFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        zirnayFeedbackResponseSchema,
      ),
    });

    return {
      feedbackId: response.feedback_id,
      requestId: response.request_id,
      modelSlug: response.model_slug,
      predictedOutcome: response.predicted_outcome,
      actualOutcome: response.actual_outcome,
      feedbackType: response.feedback_type,
      cacheCleared: response.cache_cleared,
      ingestedToBuffer: response.ingested_to_buffer,
      createdAt: response.created_at,
    };
  };

  const uploadDataset = async ({
    teamSlug,
    team: teamAlias,
    modelSlug,
    model: modelAlias,
    filename,
    datasetName,
    data,
    file,
    format,
    validation = 'strict',
    maxRejections = 5000,
    headers: requestHeaders,
    abortSignal,
  }: UploadDatasetOptions) => {
    const team = teamSlug ?? teamAlias;
    const mod = modelSlug ?? modelAlias;
    if (!team || !mod) {
      throw new Error(
        'uploadDataset requires teamSlug and modelSlug (or team and model).',
      );
    }
    const fname = filename ?? datasetName ?? 'dataset.jsonl';
    const payloadData = data ?? (typeof file === 'string' ? file : '');

    const resolvedBaseHeaders = await resolve(headers());
    const { value: response } = await postJsonToApi({
      url: `${baseURL}/teams/${team}/models/${mod}/datasets/upload`,
      headers: combineHeaders(resolvedBaseHeaders, requestHeaders),
      body: {
        filename: fname,
        data: payloadData,
        format,
        validation,
        max_rejections: maxRejections,
      },
      abortSignal,
      fetch: options.fetch,
      failedResponseHandler: zirnayFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        zodSchema(
          z.object({
            dataset_id: z.string().nullish(),
            filename: z.string().nullish(),
            status: z.string().nullish(),
            record_count: z.number().nullish(),
            size_bytes: z.number().nullish(),
            sha256: z.string().nullish(),
          }),
        ),
      ),
    });
    return {
      datasetId: response.dataset_id ?? undefined,
      filename: response.filename ?? undefined,
      status: response.status ?? undefined,
      recordCount: response.record_count ?? undefined,
      sizeBytes: response.size_bytes ?? undefined,
      sha256: response.sha256 ?? undefined,
    };
  };

  const triggerTraining = async ({
    teamSlug,
    team: teamAlias,
    modelSlug,
    model: modelAlias,
    datasetId,
    hyperparameters,
    headers: requestHeaders,
    abortSignal,
  }: TriggerTrainingOptions) => {
    const team = teamSlug ?? teamAlias;
    const mod = modelSlug ?? modelAlias;
    if (!team || !mod) {
      throw new Error(
        'triggerTraining requires teamSlug and modelSlug (or team and model).',
      );
    }
    const resolvedBaseHeaders = await resolve(headers());
    const { value: response } = await postJsonToApi({
      url: `${baseURL}/teams/${team}/models/${mod}/train`,
      headers: combineHeaders(resolvedBaseHeaders, requestHeaders),
      body: {
        dataset_id: datasetId,
        ...(hyperparameters && {
          hyperparameters: {
            epochs: hyperparameters.epochs,
            learning_rate:
              hyperparameters.learningRate ?? hyperparameters.learning_rate,
            batch_size: hyperparameters.batchSize ?? hyperparameters.batch_size,
          },
        }),
      },
      abortSignal,
      fetch: options.fetch,
      failedResponseHandler: zirnayFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        zodSchema(z.record(z.string(), z.unknown())),
      ),
    });
    return response as Record<string, unknown>;
  };

  const activateCheckpoint = async ({
    teamSlug,
    team: teamAlias,
    modelSlug,
    model: modelAlias,
    checkpointId,
    headers: requestHeaders,
    abortSignal,
  }: ActivateCheckpointOptions) => {
    const team = teamSlug ?? teamAlias;
    const mod = modelSlug ?? modelAlias;
    if (!team || !mod) {
      throw new Error(
        'activateCheckpoint requires teamSlug and modelSlug (or team and model).',
      );
    }
    const resolvedBaseHeaders = await resolve(headers());
    const { value: response } = await postJsonToApi({
      url: `${baseURL}/teams/${team}/models/${mod}/checkpoints/${checkpointId}/activate`,
      headers: combineHeaders(resolvedBaseHeaders, requestHeaders),
      body: {},
      abortSignal,
      fetch: options.fetch,
      failedResponseHandler: zirnayFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        zodSchema(z.record(z.string(), z.unknown())),
      ),
    });
    return response as Record<string, unknown>;
  };

  return {
    specificationVersion: 'v4',
    decisionModel,
    evaluationModel: decisionModel,
    registerModel,
    createModel: registerModel,
    updateModelConfig,
    directDecide,
    submitFeedback,
    uploadDataset,
    triggerTraining,
    activateCheckpoint,
    languageModel: modelId => {
      throw new NoSuchModelError({ modelId, modelType: 'languageModel' });
    },
    embeddingModel: modelId => {
      throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
    },
    imageModel: modelId => {
      throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
    },
  };
}

export const zirnay = createZirnay();
