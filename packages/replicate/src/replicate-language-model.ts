import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3StreamPart,
  SharedV3Warning,
} from '@ai-sdk/provider';
import type { Resolvable } from '@ai-sdk/provider-utils';
import {
  FetchFunction,
  combineHeaders,
  createJsonResponseHandler,
  postJsonToApi,
  resolve,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { replicateFailedResponseHandler } from './replicate-error';
import { ReplicateLanguageModelId } from './replicate-language-settings';

interface ReplicateLanguageModelConfig {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
}

export class ReplicateLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3';

  readonly supportedUrls = {
    'image/*': [/^https?:\/\/.*$/],
  };

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: ReplicateLanguageModelId,
    private readonly config: ReplicateLanguageModelConfig,
  ) {}

  private convertPromptToReplicateFormat(
    prompt: LanguageModelV3CallOptions['prompt'],
  ): string {
    // Convert the prompt to Replicate's expected format
    // Most Replicate models expect a simple prompt string
    const parts: string[] = [];

    for (const message of prompt) {
      if (message.role === 'system') {
        // System content is a string
        parts.push(`System: ${message.content}`);
      } else if (message.role === 'user') {
        // User content is an array
        for (const part of message.content) {
          if (part.type === 'text') {
            parts.push(`User: ${part.text}`);
          }
        }
      } else if (message.role === 'assistant') {
        // Assistant content is an array
        for (const part of message.content) {
          if (part.type === 'text') {
            parts.push(`Assistant: ${part.text}`);
          }
        }
      }
    }

    return parts.join('\n\n');
  }

  async doGenerate(
    options: LanguageModelV3CallOptions,
  ): Promise<Awaited<ReturnType<LanguageModelV3['doGenerate']>>> {
    const warnings: SharedV3Warning[] = [];
    const [modelId, version] = this.modelId.split(':');

    const currentDate = this.config._internal?.currentDate?.() ?? new Date();

    const prompt = this.convertPromptToReplicateFormat(options.prompt);

    // Build input object with standard parameters
    const input: Record<string, unknown> = {
      prompt,
    };

    // Add standard parameters if provided
    if (options.maxOutputTokens != null) {
      input.max_tokens = options.maxOutputTokens;
      input.max_new_tokens = options.maxOutputTokens; // Some models use this
    }
    if (options.temperature != null) {
      input.temperature = options.temperature;
    }
    if (options.topP != null) {
      input.top_p = options.topP;
    }
    if (options.topK != null) {
      input.top_k = options.topK;
    }
    if (options.stopSequences != null && options.stopSequences.length > 0) {
      input.stop_sequences = options.stopSequences.join(',');
    }
    if (options.seed != null) {
      input.seed = options.seed;
    }

    // Add provider-specific options
    if (options.providerOptions?.replicate) {
      Object.assign(input, options.providerOptions.replicate);
    }

    const {
      value: { id, output },
      responseHeaders,
    } = await postJsonToApi({
      url:
        // different endpoints for versioned vs unversioned models:
        version != null
          ? `${this.config.baseURL}/predictions`
          : `${this.config.baseURL}/models/${modelId}/predictions`,

      headers: combineHeaders(
        await resolve(this.config.headers),
        options.headers,
        {
          prefer: 'wait',
        },
      ),

      body: {
        input,
        // for versioned models, include the version in the body:
        ...(version != null ? { version } : {}),
      },

      successfulResponseHandler: createJsonResponseHandler(
        replicateLanguageResponseSchema,
      ),
      failedResponseHandler: replicateFailedResponseHandler,
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    // Parse the output - it can be a string or array of strings
    let text: string;
    if (Array.isArray(output)) {
      text = output.join('');
    } else if (typeof output === 'string') {
      text = output;
    } else {
      text = String(output);
    }

    return {
      content: [{ type: 'text', text }],
      finishReason: 'stop',
      usage: {
        inputTokens: undefined, // Replicate doesn't provide token counts in the response
        outputTokens: undefined,
        totalTokens: undefined,
      },
      warnings,
      response: {
        id,
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
      providerMetadata: {
        replicate: {},
      },
    };
  }

  async doStream(
    options: LanguageModelV3CallOptions,
  ): Promise<Awaited<ReturnType<LanguageModelV3['doStream']>>> {
    const warnings: SharedV3Warning[] = [];
    const [modelId, version] = this.modelId.split(':');

    const currentDate = this.config._internal?.currentDate?.() ?? new Date();

    const prompt = this.convertPromptToReplicateFormat(options.prompt);

    // Build input object
    const input: Record<string, unknown> = {
      prompt,
    };

    if (options.maxOutputTokens != null) {
      input.max_tokens = options.maxOutputTokens;
      input.max_new_tokens = options.maxOutputTokens;
    }
    if (options.temperature != null) {
      input.temperature = options.temperature;
    }
    if (options.topP != null) {
      input.top_p = options.topP;
    }
    if (options.topK != null) {
      input.top_k = options.topK;
    }
    if (options.stopSequences != null && options.stopSequences.length > 0) {
      input.stop_sequences = options.stopSequences.join(',');
    }
    if (options.seed != null) {
      input.seed = options.seed;
    }

    if (options.providerOptions?.replicate) {
      Object.assign(input, options.providerOptions.replicate);
    }

    const {
      value: { id, urls },
      responseHeaders,
    } = await postJsonToApi({
      url:
        version != null
          ? `${this.config.baseURL}/predictions`
          : `${this.config.baseURL}/models/${modelId}/predictions`,

      headers: combineHeaders(
        await resolve(this.config.headers),
        options.headers,
      ),

      body: {
        input,
        stream: true,
        ...(version != null ? { version } : {}),
      },

      successfulResponseHandler: createJsonResponseHandler(
        replicateStreamPredictionSchema,
      ),
      failedResponseHandler: replicateFailedResponseHandler,
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    if (!urls?.stream) {
      throw new Error(
        'Model does not support streaming or stream URL not available',
      );
    }

    // For now, we'll return a simple implementation
    // A more sophisticated implementation would connect to the stream URL
    // and parse Server-Sent Events, but that requires additional complexity
    const stream = new ReadableStream<LanguageModelV3StreamPart>({
      async start(controller) {
        controller.enqueue({ type: 'stream-start', warnings });
        controller.enqueue({
          type: 'text-delta',
          id: 'streaming',
          delta:
            'Streaming support for Replicate is experimental and coming soon',
        });
        controller.enqueue({
          type: 'finish',
          finishReason: 'stop',
          usage: {
            inputTokens: undefined,
            outputTokens: undefined,
            totalTokens: undefined,
          },
        });
        controller.close();
      },
    });

    return {
      stream,
    };
  }
}

const replicateLanguageResponseSchema = z.object({
  id: z.string(),
  output: z.union([z.array(z.string()), z.string(), z.any()]),
});

const replicateStreamPredictionSchema = z.object({
  id: z.string(),
  urls: z
    .object({
      stream: z.string().optional(),
      get: z.string().optional(),
    })
    .optional(),
});
