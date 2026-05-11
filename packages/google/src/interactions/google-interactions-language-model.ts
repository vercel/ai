import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4FinishReason,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamResult,
  SharedV4ProviderMetadata,
  SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  generateId as defaultGenerateId,
  parseProviderOptions,
  postJsonToApi,
  resolve,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
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
  GoogleInteractionsGenerationConfig,
  GoogleInteractionsRequestBody,
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
  supportedUrls?: () => LanguageModelV4['supportedUrls'];
};

export type GoogleInteractionsModelInput =
  | GoogleInteractionsModelId
  | { agent: string };

export class GoogleInteractionsLanguageModel implements LanguageModelV4 {
  readonly specificationVersion = 'v4';

  readonly modelId: string;

  /**
   * Optional agent name. When provided, the request body sends `agent:` instead
   * of `model:` and rejects `tools` / `generation_config` (warned, not thrown).
   */
  readonly agent: string | undefined;

  private readonly config: GoogleInteractionsConfig;

  static [WORKFLOW_SERIALIZE](model: GoogleInteractionsLanguageModel) {
    return {
      ...serializeModelOptions({
        modelId: model.modelId,
        config: model.config,
      }),
      agent: model.agent,
    };
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: string;
    agent?: string;
    config: GoogleInteractionsConfig;
  }) {
    return new GoogleInteractionsLanguageModel(
      options.agent != null ? { agent: options.agent } : options.modelId,
      options.config,
    );
  }

  constructor(
    modelOrAgent: GoogleInteractionsModelInput,
    config: GoogleInteractionsConfig,
  ) {
    if (typeof modelOrAgent === 'string') {
      this.modelId = modelOrAgent;
      this.agent = undefined;
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

  private async getArgs(options: LanguageModelV4CallOptions) {
    const warnings: Array<SharedV4Warning> = [];

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
     * Structured output mapping (resolves PRD Open Q1).
     *
     * The Interactions API exposes structured output via two top-level body
     * fields: `response_mime_type` (always `'application/json'` here) and
     * `response_format` (typed as `unknown` in the js-genai SDK). Per the
     * canonical sample at
     * `googleapis/js-genai/sdk-samples/interactions_structured_output_json.ts`,
     * `response_format` accepts a **plain JSON Schema** value directly - no
     * wrapping object, no OpenAPI conversion. The js-genai resource type
     * (`src/interactions/resources/interactions.ts:1399`) confirms the field is
     * passed through verbatim. We therefore send the AI SDK
     * `responseFormat.schema` (a `JSONSchema7`) as-is.
     *
     * If a future API revision rejects plain JSON Schema, fall back to
     * `convertJSONSchemaToOpenAPISchema(...)` (already imported by
     * `google-language-model.ts`); empirically that has not been needed.
     *
     * Agent calls cannot send `generation_config` and (per the API) cannot
     * combine with structured output - emit a warning and drop the field.
     */
    let responseMimeType: string | undefined;
    let responseFormat: unknown | undefined;
    if (options.responseFormat?.type === 'json') {
      if (isAgent) {
        warnings.push({
          type: 'other',
          message:
            'google.interactions: structured output (responseFormat) is not supported when an agent is set; responseFormat will be ignored.',
        });
      } else {
        responseMimeType = 'application/json';
        if (options.responseFormat.schema != null) {
          responseFormat = options.responseFormat.schema;
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
     * exclusive. We stay minimal here for TASK-1 - only the AI SDK call-level
     * generation params and the thinking/imageConfig provider options flow
     * into `generation_config`. Tool-related fields land here in later tasks.
     *
     * When an agent is set, none of these fields are accepted by the API. Per
     * PRD US 31 we emit a single `LanguageModelV4CallWarning` listing the
     * dropped field names and continue (do not throw); the agent-only
     * `agent_config` field supersedes them.
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
        image_config:
          opts?.imageConfig != null
            ? pruneUndefined({
                aspect_ratio: opts.imageConfig.aspectRatio ?? undefined,
                image_size: opts.imageConfig.imageSize ?? undefined,
              })
            : undefined,
        tool_choice: toolChoiceForBody,
      });
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

    /*
     * Agent calls require `background: true` on the wire — otherwise the API
     * rejects them with `background=true is required for agent interactions.`
     * The server returns a non-terminal status (`in_progress`/`requires_action`)
     * and the final outputs are streamed via `GET /interactions/{id}?stream=true`
     * (or polled via `GET /interactions/{id}`). This is handled internally in
     * `doGenerate` / `doStream` so the user-facing surface stays identical to
     * model-id calls.
     *
     * Model-id calls retain their original synchronous behavior — no
     * `background` field is sent. (No documented model accepts `background:
     * true` today; revisit when one does.)
     */
    const args: GoogleInteractionsRequestBody = pruneUndefined({
      ...(isAgent ? { agent: this.agent } : { model: this.modelId }),
      input,
      system_instruction: systemInstruction,
      tools: toolsForBody,
      response_format: responseFormat,
      response_mime_type: responseMimeType,
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
      ...(isAgent ? { background: true } : {}),
    });

    return {
      args,
      warnings,
      isAgent,
      pollingTimeoutMs: opts?.pollingTimeoutMs ?? undefined,
    };
  }

  async doGenerate(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4GenerateResult> {
    const { args, warnings, isAgent, pollingTimeoutMs } =
      await this.getArgs(options);

    const url = `${this.config.baseURL}/interactions`;

    const mergedHeaders = combineHeaders(
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
     * Agent calls run with `background: true`; the POST returns immediately
     * with a non-terminal status (`in_progress` / `requires_action`). Poll
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
      outputs: response.outputs ?? null,
      generateId: this.config.generateId ?? defaultGenerateId,
      interactionId,
    });

    const finishReason: LanguageModelV4FinishReason = {
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
    const providerMetadata: SharedV4ProviderMetadata = {
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
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4StreamResult> {
    const { args, warnings, isAgent, pollingTimeoutMs } =
      await this.getArgs(options);

    const url = `${this.config.baseURL}/interactions`;

    const mergedHeaders = combineHeaders(
      this.config.headers ? await resolve(this.config.headers) : undefined,
      options.headers,
    );

    /*
     * Agent calls require `background: true`, which is incompatible with
     * `stream: true` on POST. Drive these via POST background -> GET stream
     * (with terminal-status short-circuit). The user-facing stream surface
     * stays identical -- text-start / text-delta / text-end / finish parts
     * are emitted in the same order as a true SSE response.
     */
    if (isAgent) {
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
    warnings: Array<SharedV4Warning>;
    url: string;
    mergedHeaders: Record<string, string | undefined>;
    options: LanguageModelV4CallOptions;
    pollingTimeoutMs: number | undefined;
  }): Promise<LanguageModelV4StreamResult> {
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

function pruneUndefined<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    result[key] = value;
  }
  return result as T;
}
