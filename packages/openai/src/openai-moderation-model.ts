import {
  combineHeaders,
  createJsonResponseHandler,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { OpenAIConfig } from './openai-config';
import { openaiFailedResponseHandler } from './openai-error';
import {
  OpenAIModerationResponse,
  openaiModerationResponseSchema,
} from './openai-moderation-api-types';
import {
  OpenAIModerationModelId,
  OpenAIModerationSettings,
} from './openai-moderation-settings';

export type ModerationValue =
  | string
  | string[]
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;

export interface ModerationResult {
  /**
   * The moderation model used for analysis
   */
  model: string;

  /**
   * The moderation results for the input
   */
  results: {
    /**
     * Whether the content is flagged as violating OpenAI's usage policies
     */
    flagged: boolean;

    /**
     * Object containing per-category violation flags
     */
    categories: Record<string, boolean | null>;

    /**
     * Object containing per-category violation scores
     */
    category_scores: Record<string, number>;

    /**
     * Object showing which input types (text or image) triggered each category
     */
    category_applied_input_types?: Record<string, string[]>;
  }[];

  /**
   * Additional metadata from the response
   */
  rawResponse: {
    headers: Record<string, string>;
  };
}

export class OpenAIModerationModel {
  readonly specificationVersion = 'v1';
  readonly modelId: OpenAIModerationModelId;
  private readonly config: OpenAIConfig;
  private readonly settings: OpenAIModerationSettings;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    modelId: OpenAIModerationModelId,
    settings: OpenAIModerationSettings,
    config: OpenAIConfig,
  ) {
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
  }

  /**
   * Create a moderation for the given input
   *
   * @param options - Moderation options
   * @returns The moderation results
   */
  async moderate({
    input,
    headers,
    abortSignal,
  }: {
    input: ModerationValue;
    headers?: Record<string, string>;
    abortSignal?: AbortSignal;
  }): Promise<ModerationResult> {
    // Transform input to the format expected by the API
    let inputPayload: any;
    
    if (typeof input === 'string') {
      // Single string input
      inputPayload = input;
    } else if (Array.isArray(input) && input.length > 0) {
      if (typeof input[0] === 'string') {
        // Array of strings
        inputPayload = input;
      } else {
        // Array of multimodal inputs
        inputPayload = input;
      }
    } else {
      // Single multimodal input (text or image)
      inputPayload = input;
    }

    const { responseHeaders, value: response } =
      await postJsonToApi<OpenAIModerationResponse>({
        url: this.config.url({
          path: '/moderations',
          modelId: this.modelId,
        }),
        headers: combineHeaders(this.config.headers(), headers),
        body: {
          model: this.modelId,
          input: inputPayload,
          user: this.settings.user,
        },
        failedResponseHandler: openaiFailedResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(
          openaiModerationResponseSchema,
        ),
        abortSignal,
        fetch: this.config.fetch,
      });

    // Convert Headers to a simple Record<string, string>
    const headerRecord: Record<string, string> = {};
    if (responseHeaders) {
      if (responseHeaders instanceof Headers) {
        // If it's a Headers instance, use its forEach method
        responseHeaders.forEach((value, key) => {
          headerRecord[key] = value;
        });
      } else {
        // Otherwise treat it as a regular object
        for (const [key, value] of Object.entries(responseHeaders)) {
          headerRecord[key] = value;
        }
      }
    }

    return {
      model: response.model,
      results: response.results.map(result => ({
        flagged: result.flagged,
        categories: result.categories,
        category_scores: result.category_scores,
        category_applied_input_types: result.category_applied_input_types,
      })),
      rawResponse: {
        headers: headerRecord,
      },
    };
  }
}
