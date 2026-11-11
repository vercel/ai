import {
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
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import * as z from 'zod/v4';
import { DecisionZirnayModel } from './zirnay-decision-model';
import type { ZirnayDecisionModelId } from './zirnay-decision-model-options';
import {
  zirnayFailedResponseHandler,
  zirnayFeedbackResponseSchema,
} from './zirnay-decision-api';
import { VERSION } from './version';

export interface CreateModelOptions {
  teamSlug: string;
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

export interface UpdateModelConfigOptions {
  teamSlug: string;
  modelSlug: string;
  config: Record<string, unknown>;
  headers?: Record<string, string>;
  abortSignal?: AbortSignal;
}

export interface DirectDecideOptions {
  teamSlug: string;
  modelSlug: string;
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
  modelSlug?: string;
  requestId: string;
  actualOutcome: string | number | boolean;
  feedbackType: 'CORRECTION' | 'AFFIRMATION' | 'ESCALATION';
  reviewer?: {
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
  teamSlug: string;
  modelSlug: string;
  filename: string;
  data: string;
  format: {
    dataset_name: string;
    description?: string;
    target_field?: string;
    fields: Array<{
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
  teamSlug: string;
  modelSlug: string;
  datasetId: string;
  hyperparameters?: {
    epochs?: number;
    learningRate?: number;
    batchSize?: number;
  };
  headers?: Record<string, string>;
  abortSignal?: AbortSignal;
}

export interface ActivateCheckpointOptions {
  teamSlug: string;
  modelSlug: string;
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
   * Create a new model instance on Zirnay (POST /v1/teams/{team_slug}/models).
   */
  createModel(options: CreateModelOptions): Promise<Record<string, unknown>>;

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

  const createModel = async ({
    teamSlug,
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
  }: CreateModelOptions) => {
    const resolvedBaseHeaders = await resolve(headers());
    const { value: response } = await postJsonToApi({
      url: `${baseURL}/teams/${teamSlug}/models`,
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

  const updateModelConfig = async ({
    teamSlug,
    modelSlug,
    config,
    headers: requestHeaders,
    abortSignal,
  }: UpdateModelConfigOptions) => {
    const resolvedBaseHeaders = await resolve(headers());
    const { value: response } = await postJsonToApi({
      url: `${baseURL}/teams/${teamSlug}/models/${modelSlug}`,
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
    modelSlug,
    rawText,
    jsonState,
    query,
    features,
    options: decideOpts,
    headers: requestHeaders,
    abortSignal,
  }: DirectDecideOptions): Promise<DirectDecideResponse> => {
    const resolvedBaseHeaders = await resolve(headers());
    const { value: response } = await postJsonToApi({
      url: `${baseURL}/teams/${teamSlug}/models/${modelSlug}/decide`,
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
    modelSlug,
    requestId,
    actualOutcome,
    feedbackType,
    reviewer,
    metadata,
    headers: requestHeaders,
    abortSignal,
  }: SubmitFeedbackOptions): Promise<SubmitFeedbackResponse> => {
    let team = teamSlug;
    let mod = modelSlug;

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

    const resolvedBaseHeaders = await resolve(headers());
    const { value: response } = await postJsonToApi({
      url: `${baseURL}/teams/${team}/models/${mod}/feedback`,
      headers: combineHeaders(resolvedBaseHeaders, requestHeaders),
      body: {
        request_id: requestId,
        actual_outcome: actualOutcome,
        feedback_type: feedbackType,
        ...(reviewer && {
          reviewer: {
            reviewer_id: reviewer.reviewerId,
            reviewer_role: reviewer.reviewerRole,
            notes: reviewer.notes,
          },
        }),
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
    modelSlug,
    filename,
    data,
    format,
    validation = 'strict',
    maxRejections = 5000,
    headers: requestHeaders,
    abortSignal,
  }: UploadDatasetOptions) => {
    const resolvedBaseHeaders = await resolve(headers());
    const { value: response } = await postJsonToApi({
      url: `${baseURL}/teams/${teamSlug}/models/${modelSlug}/datasets/upload`,
      headers: combineHeaders(resolvedBaseHeaders, requestHeaders),
      body: {
        filename,
        data,
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
    modelSlug,
    datasetId,
    hyperparameters,
    headers: requestHeaders,
    abortSignal,
  }: TriggerTrainingOptions) => {
    const resolvedBaseHeaders = await resolve(headers());
    const { value: response } = await postJsonToApi({
      url: `${baseURL}/teams/${teamSlug}/models/${modelSlug}/train`,
      headers: combineHeaders(resolvedBaseHeaders, requestHeaders),
      body: {
        dataset_id: datasetId,
        ...(hyperparameters && {
          hyperparameters: {
            epochs: hyperparameters.epochs,
            learning_rate: hyperparameters.learningRate,
            batch_size: hyperparameters.batchSize,
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
    modelSlug,
    checkpointId,
    headers: requestHeaders,
    abortSignal,
  }: ActivateCheckpointOptions) => {
    const resolvedBaseHeaders = await resolve(headers());
    const { value: response } = await postJsonToApi({
      url: `${baseURL}/teams/${teamSlug}/models/${modelSlug}/checkpoints/${checkpointId}/activate`,
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
    createModel,
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
