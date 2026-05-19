import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3FinishReason,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamResult,
  SharedV3ProviderMetadata,
  SharedV3Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  generateId as defaultGenerateId,
  parseProviderOptions,
  postJsonToApi,
  resolve,
  type FetchFunction,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { googleFailedResponseHandler } from '../google-error';
import { buildGoogleInteractionsStreamTransform } from './build-google-interactions-stream-transform';
import { convertGoogleInteractionsUsage } from './convert-google-interactions-usage';
import { convertToGoogleInteractionsInput } from './convert-to-google-interactions-input';
import {
  googleInteractionsEventSchema,
  googleInteractionsResponseSchema,
} from './google-interactions-api';
import {
  googleInteractionsLanguageModelOptions,
  type GoogleInteractionsModelId,
} from './google-interactions-language-model-options';
import type {
  GoogleInteractionsAgentConfig,
  GoogleInteractionsEnvironmentSource,
  GoogleInteractionsGenerationConfig,
  GoogleInteractionsNetworkAllowlistEntry,
  GoogleInteractionsNetworkConfig,
  GoogleInteractionsRequestBody,
  GoogleInteractionsResponseFormatEntry,
  GoogleInteractionsTool,
  GoogleInteractionsToolChoice,
} from './google-interactions-prompt';
import { mapGoogleInteractionsFinishReason } from './map-google-interactions-finish-reason';
import { parseGoogleInteractionsOutputs } from './parse-google-interactions-outputs';
import {
  isTerminalStatus,
  pollGoogleInteractionUntilTerminal,
} from './poll-google-interactions';
import { prepareGoogleInteractionsTools } from './prepare-google-interactions-tools';
import { streamGoogleInteractionEvents } from './stream-google-interactions';
import { synthesizeGoogleInteractionsAgentStream } from './synthesize-google-interactions-agent-stream';

export type GoogleInteractionsConfig = {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  generateId: () => string;
  supportedUrls?: () => LanguageModelV3['supportedUrls'];
};

export type GoogleInteractionsModelInput =
  | GoogleInteractionsModelId
  | { agent: string }
  | { managedAgent: string };

export class GoogleInteractionsLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3';

  readonly modelId: string;

  /**
   * Optional agent name. When provided, the request body sends `agent:` instead
   * of `model:` and rejects `tools` / `generation_config` (warned, not thrown).
   */
  readonly agent: string | undefined;

  private readonly config: GoogleInteractionsConfig;

  constructor(
    modelOrAgent: GoogleInteractionsModelInput,
    config: GoogleInteractionsConfig,
  ) {
    if (typeof modelOrAgent === 'string') {
      this.modelId = modelOrAgent;
      this.agent = undefined;
    } else if ('managedAgent' in modelOrAgent) {
      this.modelId = modelOrAgent.managedAgent;
      this.agent = modelOrAgent.managedAgent;
    } else {
      this.modelId = modelOrAgent.agent;
      this.agent = modelOrAgent.agent;
    }
    this.config = config;
  }

  get provider(): string {
    return this.config.provider;
  }

  get supportedUrls() {
    if (this.config.supportedUrls) {
      return this.config.supportedUrls();
    }
    return {
      'image/*': [/^https?:\/\/.+/],
      'application/pdf': [/^https?:\/\/.+/],
      'audio/*': [/^https?:\/\/.+/],
      'video/*': [
        /^https?:\/\/(www\.)?youtube\.com\/watch\?v=.+/,
        /^https?:\/\/youtu\.be\/.+/,
        /^gs:\/\/.+/,
      ],
    };
  }

  private async getArgs(options: LanguageModelV3CallOptions) {
    const warnings: Array<SharedV3Warning> = [];

    const opts = await parseProviderOptions({
      provider: 'google',
      providerOptions: options.providerOptions,
      schema: googleInteractionsLanguageModelOptions,
    });

    const isAgent = this.agent != null;

    const hasTools = options.tools != null && options.tools.length > 0;

    let toolsForBody: Array<GoogleInteractionsTool> | undefined;
    let toolChoiceForBody: GoogleInteractionsToolChoice | undefined;

    if (hasTools && isAgent) {
      warnings.push({
        type: 'other',
        message:
          'google.interactions: tools are not supported when an agent is set; tools will be omitted from the request body.',
      });
    } else if (hasTools) {
      const prepared = prepareGoogleInteractionsTools({
        tools: options.tools,
        toolChoice: options.toolChoice,
      });
      toolsForBody = prepared.tools;
      toolChoiceForBody = prepared.toolChoice;
      warnings.push(...prepared.toolWarnings);
    }

    /*
     * `response_format` is a polymorphic array of entries. Three sources
     * contribute, in order:
     *
     *   1. AI SDK call-level `responseFormat: { type: 'json', schema }` →
     *      `{ type: 'text', mime_type: 'application/json', schema }`.
     *   2. `providerOptions.google.responseFormat` (primary path) — entries
     *      are appended verbatim with camelCase → snake_case translation.
     *   3. `providerOptions.google.imageConfig` (deprecated fallback) — only
     *      contributes if no `{type:'image'}` entry was already provided via
     *      sources 1 or 2; emits a deprecation warning when used.
     *
     * Agent calls cannot send `generation_config` and (per the API) cannot
     * combine with structured output — emit a warning and drop the field.
     */
    const responseFormatEntries: Array<GoogleInteractionsResponseFormatEntry> =
      [];
    if (options.responseFormat?.type === 'json') {
      if (isAgent) {
        warnings.push({
          type: 'other',
          message:
            'google.interactions: structured output (responseFormat) is not supported when an agent is set; responseFormat will be ignored.',
        });
      } else {
        const entry: GoogleInteractionsResponseFormatEntry = {
          type: 'text',
          mime_type: 'application/json',
          ...(options.responseFormat.schema != null
            ? { schema: options.responseFormat.schema }
            : {}),
        };
        responseFormatEntries.push(entry);
      }
    }

    if (opts?.responseFormat != null) {
      for (const entry of opts.responseFormat) {
        if (entry.type === 'text') {
          responseFormatEntries.push(
            pruneUndefined({
              type: 'text' as const,
              mime_type: entry.mimeType ?? undefined,
              schema: entry.schema ?? undefined,
            }),
          );
        } else if (entry.type === 'image') {
          responseFormatEntries.push(
            pruneUndefined({
              type: 'image' as const,
              mime_type: entry.mimeType ?? undefined,
              aspect_ratio: entry.aspectRatio ?? undefined,
              image_size: entry.imageSize ?? undefined,
            }),
          );
        } else if (entry.type === 'audio') {
          responseFormatEntries.push(
            pruneUndefined({
              type: 'audio' as const,
              mime_type: entry.mimeType ?? undefined,
            }),
          );
        }
      }
    }

    const {
      input,
      systemInstruction: convertedSystemInstruction,
      warnings: convWarnings,
    } = convertToGoogleInteractionsInput({
      prompt: options.prompt,
      previousInteractionId: opts?.previousInteractionId ?? undefined,
      store: opts?.store ?? undefined,
      mediaResolution: opts?.mediaResolution ?? undefined,
    });

    warnings.push(...convWarnings);

    let systemInstruction = convertedSystemInstruction;
    const optionSystemInstruction = opts?.systemInstruction ?? undefined;
    if (systemInstruction != null && optionSystemInstruction != null) {
      warnings.push({
        type: 'other',
        message:
          'google.interactions: both AI SDK system message and providerOptions.google.systemInstruction were set; using the AI SDK system message.',
      });
    } else if (systemInstruction == null && optionSystemInstruction != null) {
      systemInstruction = optionSystemInstruction;
    }

    /*
     * The Interactions API splits per-call config into `generation_config`
     * (model branch) and `agent_config` (agent branch); the two are mutually
     * exclusive. The AI SDK call-level generation params and the thinking /
     * imageConfig provider options flow into `generation_config`.
     *
     * When an agent is set, none of these fields are accepted by the API.
     * Emit a single `LanguageModelV3CallWarning` listing the dropped field
     * names and continue (do not throw); the agent-only `agent_config`
     * field supersedes them.
     */
    let generationConfig: GoogleInteractionsGenerationConfig | undefined;
    if (isAgent) {
      const droppedFields: Array<string> = [];
      if (options.temperature != null) droppedFields.push('temperature');
      if (options.topP != null) droppedFields.push('topP');
      if (options.seed != null) droppedFields.push('seed');
      if (options.stopSequences != null && options.stopSequences.length > 0) {
        droppedFields.push('stopSequences');
      }
      if (options.maxOutputTokens != null)
        droppedFields.push('maxOutputTokens');
      if (opts?.thinkingLevel != null) droppedFields.push('thinkingLevel');
      if (opts?.thinkingSummaries != null) {
        droppedFields.push('thinkingSummaries');
      }
      if (opts?.imageConfig != null) droppedFields.push('imageConfig');
      if (droppedFields.length > 0) {
        warnings.push({
          type: 'other',
          message: `google.interactions: ${droppedFields.join(', ')} ${droppedFields.length === 1 ? 'is' : 'are'} not supported when an agent is set; use providerOptions.google.agentConfig instead. Dropped from the request body.`,
        });
      }
      generationConfig = undefined;
    } else {
      generationConfig = pruneUndefined({
        temperature: options.temperature ?? undefined,
        top_p: options.topP ?? undefined,
        seed: options.seed ?? undefined,
        stop_sequences:
          options.stopSequences != null && options.stopSequences.length > 0
            ? options.stopSequences
            : undefined,
        max_output_tokens: options.maxOutputTokens ?? undefined,
        thinking_level: opts?.thinkingLevel ?? undefined,
        thinking_summaries: opts?.thinkingSummaries ?? undefined,
        tool_choice: toolChoiceForBody,
      });

      /*
       * Deprecated fallback path: `imageConfig` contributes an image entry
       * only when none was supplied via `responseFormat`. A warning is
       * always emitted when `imageConfig` is set so callers migrate to the
       * `responseFormat` shape.
       */
      if (opts?.imageConfig != null) {
        const alreadyHasImageEntry = responseFormatEntries.some(
          entry => entry.type === 'image',
        );
        warnings.push({
          type: 'other',
          message: alreadyHasImageEntry
            ? 'google.interactions: providerOptions.google.imageConfig is deprecated and was ignored because providerOptions.google.responseFormat already supplies an image entry. Use responseFormat exclusively.'
            : 'google.interactions: providerOptions.google.imageConfig is deprecated. Use providerOptions.google.responseFormat with a { type: "image", ... } entry instead.',
        });
        if (!alreadyHasImageEntry) {
          responseFormatEntries.push({
            type: 'image',
            mime_type: 'image/png',
            ...(opts.imageConfig.aspectRatio != null
              ? { aspect_ratio: opts.imageConfig.aspectRatio }
              : {}),
            ...(opts.imageConfig.imageSize != null
              ? { image_size: opts.imageConfig.imageSize }
              : {}),
          });
        }
      }
    }

    let agentConfig: GoogleInteractionsAgentConfig | undefined;
    if (isAgent && opts?.agentConfig != null) {
      const ac = opts.agentConfig;
      if (ac.type === 'deep-research') {
        agentConfig = pruneUndefined({
          type: 'deep-research',
          thinking_summaries: ac.thinkingSummaries ?? undefined,
          visualization: ac.visualization ?? undefined,
          collaborative_planning: ac.collaborativePlanning ?? undefined,
        }) as GoogleInteractionsAgentConfig;
      } else if (ac.type === 'dynamic') {
        agentConfig = { type: 'dynamic' };
      }
    }

    let environment: GoogleInteractionsRequestBody['environment'];
    if (opts?.environment != null) {
      if (!isAgent) {
        warnings.push({
          type: 'other',
          message:
            'google.interactions: environment is only supported when an agent is set; environment will be omitted from the request body.',
        });
      } else if (typeof opts.environment === 'string') {
        environment = opts.environment;
      } else {
        const env = opts.environment;
        const sources: Array<GoogleInteractionsEnvironmentSource> | undefined =
          env.sources?.map(s => {
            if (s.type === 'inline') {
              return {
                type: 'inline' as const,
                content: s.content,
                target: s.target,
              };
            }
            return pruneUndefined({
              type: s.type,
              source: s.source,
              target: s.target ?? undefined,
            }) as GoogleInteractionsEnvironmentSource;
          });
        let network: GoogleInteractionsNetworkConfig | undefined;
        if (env.network === 'disabled') {
          network = 'disabled';
        } else if (env.network != null) {
          network = {
            allowlist: env.network.allowlist.map(entry =>
              pruneUndefined({
                domain: entry.domain,
                transform: entry.transform ?? undefined,
              }),
            ) as Array<GoogleInteractionsNetworkAllowlistEntry>,
          };
        }
        environment = pruneUndefined({
          type: 'remote' as const,
          sources: sources != null && sources.length > 0 ? sources : undefined,
          network,
        });
      }
    }

    /*
     * `background` is opt-in via `providerOptions.google.background`. Some
     * agents require it because their server-side workflow cannot complete
     * within a single request; others reject it. When `background: true`, the
     * POST returns a non-terminal status and the SDK polls
     * `GET /interactions/{id}` until the work completes.
     */
    const args: GoogleInteractionsRequestBody = pruneUndefined({
      ...(isAgent ? { agent: this.agent } : { model: this.modelId }),
      input,
      system_instruction: systemInstruction,
      tools: toolsForBody,
      response_format:
        responseFormatEntries.length > 0 ? responseFormatEntries : undefined,
      response_modalities:
        opts?.responseModalities != null
          ? (opts.responseModalities as Array<
              'text' | 'image' | 'audio' | 'video' | 'document'
            >)
          : undefined,
      previous_interaction_id: opts?.previousInteractionId ?? undefined,
      service_tier: opts?.serviceTier ?? undefined,
      store: opts?.store ?? undefined,
      generation_config:
        generationConfig != null && Object.keys(generationConfig).length > 0
          ? generationConfig
          : undefined,
      agent_config: agentConfig,
      environment,
      background: opts?.background ?? undefined,
    });

    return {
      args,
      warnings,
      isAgent,
      isBackground: opts?.background === true,
      pollingTimeoutMs: opts?.pollingTimeoutMs ?? undefined,
    };
  }

  async doGenerate(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3GenerateResult> {
    const { args, warnings, isAgent, pollingTimeoutMs } =
      await this.getArgs(options);

    const url = `${this.config.baseURL}/interactions`;

    const mergedHeaders = combineHeaders(
      INTERACTIONS_API_REVISION_HEADER,
      this.config.headers ? await resolve(this.config.headers) : undefined,
      options.headers,
    );

    const postResult = await postJsonToApi({
      url,
      headers: mergedHeaders,
      body: args,
      failedResponseHandler: googleFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        googleInteractionsResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    let {
      responseHeaders,
      value: response,
      rawValue: rawResponse,
    } = postResult;

    /*
     * Agent calls may return a non-terminal status (`in_progress` /
     * `requires_action`) when invoked with `background: true`. Poll
     * `GET /interactions/{id}` until terminal so the user-facing surface
     * matches a synchronous call.
     */
    if (isAgent && !isTerminalStatus(response.status)) {
      const polled = await pollGoogleInteractionUntilTerminal({
        baseURL: this.config.baseURL,
        interactionId: response.id,
        headers: mergedHeaders,
        fetch: this.config.fetch,
        abortSignal: options.abortSignal,
        timeoutMs: pollingTimeoutMs,
      });
      response = polled.response;
      rawResponse = polled.rawResponse;
      responseHeaders = polled.responseHeaders ?? responseHeaders;
    }

    /*
     * `response.id` is omitted when `store: false` (fully stateless mode), and
     * the stream surface returns `id: ""` (empty string) for the same case.
     * Normalize both to `undefined` so downstream stamping does not pollute
     * provider metadata with an empty/missing identifier.
     */
    const interactionId =
      typeof response.id === 'string' && response.id.length > 0
        ? response.id
        : undefined;

    const { content, hasFunctionCall } = parseGoogleInteractionsOutputs({
      steps: response.steps ?? null,
      generateId: this.config.generateId ?? defaultGenerateId,
      interactionId,
    });

    const finishReason: LanguageModelV3FinishReason = {
      unified: mapGoogleInteractionsFinishReason({
        status: response.status,
        hasFunctionCall,
      }),
      raw: response.status,
    };

    /*
     * Service tier divergence vs. `:generateContent`:
     *
     * `google-language-model.ts` reads the applied service tier from the
     * `x-gemini-service-tier` HTTP response header (see commit 1adfb76d2d).
     * The Interactions API does NOT surface that header; it returns the
     * applied tier in the response body as `service_tier` on the top-level
     * Interaction object (and on `interaction.complete.interaction` for
     * streaming). The `responseHeaders` parameter is also checked as a
     * defensive fallback in case the API later adds the header.
     */
    const serviceTier =
      response.service_tier ??
      responseHeaders?.['x-gemini-service-tier'] ??
      undefined;

    /*
     * `response.id` is omitted when `store: false` (fully stateless mode), so
     * `interactionId` is only surfaced when the API actually returned one.
     */
    const providerMetadata: SharedV3ProviderMetadata = {
      google: {
        ...(interactionId != null ? { interactionId } : {}),
        ...(serviceTier != null ? { serviceTier } : {}),
      },
    };

    let timestamp: Date | undefined;
    if (typeof response.created === 'string') {
      const parsed = new Date(response.created);
      if (!Number.isNaN(parsed.getTime())) {
        timestamp = parsed;
      }
    }

    return {
      content,
      finishReason,
      usage: convertGoogleInteractionsUsage(response.usage),
      warnings,
      providerMetadata,
      request: { body: args },
      response: {
        headers: responseHeaders,
        body: rawResponse,
        ...(interactionId != null ? { id: interactionId } : {}),
        ...(timestamp ? { timestamp } : {}),
        modelId: response.model ?? undefined,
      },
    };
  }

  async doStream(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3StreamResult> {
    const { args, warnings, isBackground, pollingTimeoutMs } =
      await this.getArgs(options);

    const url = `${this.config.baseURL}/interactions`;

    const mergedHeaders = combineHeaders(
      INTERACTIONS_API_REVISION_HEADER,
      this.config.headers ? await resolve(this.config.headers) : undefined,
      options.headers,
    );

    /*
     * `background: true` is incompatible with `stream: true` on POST. Drive
     * background calls via POST background -> GET stream (with terminal-status
     * short-circuit). The user-facing stream surface stays identical --
     * text-start / text-delta / text-end / finish parts are emitted in the
     * same order as a true SSE response.
     */
    if (isBackground) {
      return this.doStreamBackground({
        args,
        warnings,
        url,
        mergedHeaders,
        options,
        pollingTimeoutMs,
      });
    }

    const body = { ...args, stream: true };

    const { responseHeaders, value: response } = await postJsonToApi({
      url,
      headers: mergedHeaders,
      body,
      failedResponseHandler: googleFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        googleInteractionsEventSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    /*
     * Google's API surfaces the applied service tier in the
     * `x-gemini-service-tier` HTTP response header, not in the response body.
     * Mirror the canonical pattern from `google-language-model.ts` (commit
     * 1adfb76d2d) and pipe it through the stream transformer so the `finish`
     * part's `providerMetadata.google.serviceTier` is sourced from the header.
     */
    const headerServiceTier = responseHeaders?.['x-gemini-service-tier'];

    const transform = buildGoogleInteractionsStreamTransform({
      warnings,
      generateId: this.config.generateId ?? defaultGenerateId,
      includeRawChunks: options.includeRawChunks,
      serviceTier: headerServiceTier,
    });

    return {
      stream: response.pipeThrough(transform),
      request: { body },
      response: { headers: responseHeaders },
    };
  }

  /*
   * Drive the streaming surface for agent calls. Agents require
   * `background: true`, which is incompatible with `stream: true` on POST.
   *
   * Approach:
   *   1. POST `/interactions` with `background: true`. The response includes
   *      the interaction id and an initial (usually non-terminal) status.
   *   2. If the POST status is already terminal (rare), synthesize a stream
   *      from the polled outputs and we're done.
   *   3. Otherwise open `GET /interactions/{id}?stream=true` and pipe the
   *      SSE events through `buildGoogleInteractionsStreamTransform` so the
   *      consumer receives text deltas / thinking summaries / tool events as
   *      they happen instead of all at once at the end.
   *
   * The SSE connection can drop while the agent idles between events
   * (`UND_ERR_BODY_TIMEOUT`); `streamGoogleInteractionEvents` handles the
   * reconnect-with-`last_event_id` loop transparently.
   */
  private async doStreamBackground({
    args,
    warnings,
    url,
    mergedHeaders,
    options,
    pollingTimeoutMs,
  }: {
    args: GoogleInteractionsRequestBody;
    warnings: Array<SharedV3Warning>;
    url: string;
    mergedHeaders: Record<string, string | undefined>;
    options: LanguageModelV3CallOptions;
    pollingTimeoutMs: number | undefined;
  }): Promise<LanguageModelV3StreamResult> {
    const postResult = await postJsonToApi({
      url,
      headers: mergedHeaders,
      body: args,
      failedResponseHandler: googleFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        googleInteractionsResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const { responseHeaders: postHeaders, value: postResponse } = postResult;
    const interactionId = postResponse.id;

    if (interactionId == null || interactionId.length === 0) {
      throw new Error(
        'google.interactions: background POST response did not include an interaction id; cannot stream the result.',
      );
    }

    const headerServiceTier = postHeaders?.['x-gemini-service-tier'];

    /*
     * If the POST already returned a terminal status (e.g. cached, immediate
     * failure, or `incomplete`), there is nothing to stream from the GET --
     * synthesize directly from the response so the caller still gets a
     * complete stream.
     */
    if (isTerminalStatus(postResponse.status)) {
      const synthesized = synthesizeGoogleInteractionsAgentStream({
        response: postResponse,
        warnings,
        generateId: this.config.generateId ?? defaultGenerateId,
        includeRawChunks: options.includeRawChunks,
        headerServiceTier,
      });
      return {
        stream: synthesized,
        request: { body: args },
        response: { headers: postHeaders },
      };
    }

    /*
     * `pollingTimeoutMs` is unused on the live-SSE path -- there's no poll
     * loop to time out -- but we surface it as the per-attempt timeout for
     * the AbortSignal-driven cancel that the caller already controls. Future
     * iterations may use it as a backstop if the SSE+resume loop spins
     * indefinitely.
     */
    void pollingTimeoutMs;

    const events = streamGoogleInteractionEvents({
      baseURL: this.config.baseURL,
      interactionId,
      headers: mergedHeaders,
      fetch: this.config.fetch,
      abortSignal: options.abortSignal,
    });

    const transform = buildGoogleInteractionsStreamTransform({
      warnings,
      generateId: this.config.generateId ?? defaultGenerateId,
      includeRawChunks: options.includeRawChunks,
      serviceTier: headerServiceTier,
    });

    return {
      stream: events.pipeThrough(transform),
      request: { body: args },
      response: { headers: postHeaders },
    };
  }
}

/*
 * Pins the Interactions API revision the SDK targets. Sent on every request
 * the model issues so model-id calls, agent calls, polling, SSE reconnects,
 * and cancellation all hit the same schema.
 */
const INTERACTIONS_API_REVISION_HEADER: Record<string, string> = {
  'Api-Revision': '2026-05-20',
};

function pruneUndefined<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    result[key] = value;
  }
  return result as T;
}
