import {
  FetchFunction,
  combineHeaders,
  createJsonResponseHandler,
  lazySchema,
  loadApiKey,
  loadOptionalSetting,
  postJsonToApi,
  withoutTrailingSlash,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { openaiFailedResponseHandler } from '../openai-error';

/**
 * Options for the compact function.
 */
export interface CompactOptions {
  /**
   * Model ID to use for compaction (e.g., 'gpt-5', 'gpt-5.2').
   */
  model: string;

  /**
   * The conversation input to compact. Can be a string or array of input items.
   * Either `input` or `previousResponseId` must be provided.
   */
  input?: string | Array<Record<string, unknown>>;

  /**
   * The ID of a previous response to compact.
   * Either `input` or `previousResponseId` must be provided.
   */
  previousResponseId?: string;

  /**
   * Optional system message for the compaction request.
   * Should match instructions used in responses for best results.
   */
  instructions?: string;

  /**
   * OpenAI API key. Defaults to OPENAI_API_KEY environment variable.
   */
  apiKey?: string;

  /**
   * Base URL for the OpenAI API. Defaults to https://api.openai.com/v1.
   */
  baseURL?: string;

  /**
   * Custom headers to include in the request.
   */
  headers?: Record<string, string>;

  /**
   * Custom fetch implementation.
   */
  fetch?: FetchFunction;

  /**
   * Abort signal for cancelling the request.
   */
  abortSignal?: AbortSignal;
}

/**
 * Result of a compact operation.
 */
export interface CompactResult {
  /**
   * The unique identifier for the compacted response.
   */
  id: string;

  /**
   * Unix timestamp (in seconds) when the compacted conversation was created.
   */
  createdAt: number;

  /**
   * The compacted output items to use as input for the next request.
   */
  output: Array<Record<string, unknown>>;

  /**
   * Token usage details for the compaction.
   */
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

const compactResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      id: z.string(),
      object: z.literal('response.compaction'),
      created_at: z.number(),
      output: z.array(z.record(z.string(), z.unknown())),
      usage: z.object({
        input_tokens: z.number(),
        output_tokens: z.number(),
      }),
    }),
  ),
);

/**
 * Compacts a conversation to reduce context size while preserving the model's understanding.
 *
 * Compaction replaces prior assistant messages, tool calls, tool results, and encrypted
 * reasoning with a single encrypted compaction item. User messages are kept verbatim.
 *
 * @example
 * ```ts
 * import { compact } from '@ai-sdk/openai';
 *
 * const result = await compact({
 *   model: 'gpt-5',
 *   previousResponseId: 'resp_abc123',
 * });
 *
 * // Use result.output as input for the next request
 * ```
 */
export async function compact(options: CompactOptions): Promise<CompactResult> {
  const {
    model,
    input,
    previousResponseId,
    instructions,
    apiKey,
    baseURL: baseURLOption,
    headers: customHeaders,
    fetch: customFetch,
    abortSignal,
  } = options;

  if (!input && !previousResponseId) {
    throw new Error(
      'Either `input` or `previousResponseId` must be provided for compaction.',
    );
  }

  const baseURL =
    withoutTrailingSlash(
      loadOptionalSetting({
        settingValue: baseURLOption,
        environmentVariableName: 'OPENAI_BASE_URL',
      }),
    ) ?? 'https://api.openai.com/v1';

  const resolvedApiKey = loadApiKey({
    apiKey,
    environmentVariableName: 'OPENAI_API_KEY',
    description: 'OpenAI',
  });

  const headers = combineHeaders(
    {
      Authorization: `Bearer ${resolvedApiKey}`,
      'Content-Type': 'application/json',
    },
    customHeaders,
  );

  const body: Record<string, unknown> = {
    model,
  };

  if (input) {
    body.input = input;
  }

  if (previousResponseId) {
    body.previous_response_id = previousResponseId;
  }

  if (instructions) {
    body.instructions = instructions;
  }

  const { value: response } = await postJsonToApi({
    url: `${baseURL}/responses/compact`,
    headers,
    body,
    failedResponseHandler: openaiFailedResponseHandler,
    successfulResponseHandler: createJsonResponseHandler(compactResponseSchema),
    abortSignal,
    fetch: customFetch,
  });

  return {
    id: response.id,
    createdAt: response.created_at,
    output: response.output,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}
