import { UnsupportedFunctionalityError } from '@ai-sdk/provider';
import { ProviderOptions, withUserAgentSuffix } from '@ai-sdk/provider-utils';
import { ToolSet } from '../generate-text';
import { logWarnings } from '../logger/log-warnings';
import { resolveLanguageModel } from '../model/resolve-model';
import { ModelMessage } from '../prompt';
import { convertToLanguageModelPrompt } from '../prompt/convert-to-language-model-prompt';
import { prepareToolsAndToolChoice } from '../prompt/prepare-tools-and-tool-choice';
import { Prompt } from '../prompt/prompt';
import { standardizePrompt } from '../prompt/standardize-prompt';
import { assembleOperationName } from '../telemetry/assemble-operation-name';
import { getBaseTelemetryAttributes } from '../telemetry/get-base-telemetry-attributes';
import { getTracer } from '../telemetry/get-tracer';
import { recordSpan } from '../telemetry/record-span';
import { selectTelemetryAttributes } from '../telemetry/select-telemetry-attributes';
import { TelemetrySettings } from '../telemetry/telemetry-settings';
import { LanguageModel } from '../types';
import { prepareRetries } from '../util/prepare-retries';
import { VERSION } from '../version';
import { CountTokensResult } from './count-tokens-result';

/**
 * Count the number of tokens in a prompt before sending it to a language model.
 *
 * This is useful for:
 * - Estimating costs before making API calls
 * - Ensuring prompts fit within model context limits
 * - Optimizing prompt length
 *
 * @example
 * ```ts
 * import { anthropic } from '@ai-sdk/anthropic';
 * import { countTokens } from 'ai';
 *
 * const result = await countTokens({
 *   model: anthropic('claude-sonnet-4-5-20250929'),
 *   messages: [
 *     { role: 'user', content: 'Hello, how are you?' }
 *   ],
 * });
 *
 * console.log(`Token count: ${result.tokens}`);
 * ```
 */
export async function countTokens<TOOLS extends ToolSet>({
  model: modelArg,
  prompt,
  system,
  messages,
  tools,
  providerOptions,
  maxRetries: maxRetriesArg,
  abortSignal,
  headers,
  experimental_telemetry: telemetry,
}: {
  /**
   * The language model to use for token counting.
   */
  model: LanguageModel;

  /**
   * A simple text prompt. Cannot be used together with messages.
   */
  prompt?: string;

  /**
   * System message to include in the prompt.
   */
  system?: string;

  /**
   * Messages in the conversation. Cannot be used together with prompt.
   */
  messages?: Array<ModelMessage>;

  /**
   * Tools available to the model. Tool definitions are included in the token count.
   */
  tools?: TOOLS;

  /**
   * Provider-specific options.
   */
  providerOptions?: ProviderOptions;

  /**
   * Maximum number of retries. Set to 0 to disable retries. Default: 2.
   */
  maxRetries?: number;

  /**
   * An optional abort signal that can be used to cancel the call.
   */
  abortSignal?: AbortSignal;

  /**
   * Additional HTTP headers. Only applicable for HTTP-based providers.
   */
  headers?: Record<string, string>;

  /**
   * Telemetry configuration. Experimental feature.
   */
  experimental_telemetry?: TelemetrySettings;
}): Promise<CountTokensResult> {
  const model = resolveLanguageModel(modelArg);

  // Check if provider supports token counting
  if (!model.doCountTokens) {
    throw new UnsupportedFunctionalityError({
      functionality: `countTokens (${model.provider})`,
    });
  }

  const { maxRetries, retry } = prepareRetries({
    maxRetries: maxRetriesArg,
    abortSignal,
  });

  const headersWithUserAgent = withUserAgentSuffix(
    headers ?? {},
    `ai/${VERSION}`,
  );

  const baseTelemetryAttributes = getBaseTelemetryAttributes({
    model,
    telemetry,
    headers: headersWithUserAgent,
    settings: { maxRetries },
  });

  const tracer = getTracer(telemetry);

  return recordSpan({
    name: 'ai.countTokens',
    attributes: selectTelemetryAttributes({
      telemetry,
      attributes: {
        ...assembleOperationName({ operationId: 'ai.countTokens', telemetry }),
        ...baseTelemetryAttributes,
      },
    }),
    tracer,
    fn: async span => {
      // Convert user-facing prompt to LanguageModelV3Prompt
      const inputPrompt = await standardizePrompt({
        system,
        prompt,
        messages,
      } as Prompt);
      const languageModelPrompt = await convertToLanguageModelPrompt({
        prompt: inputPrompt,
        supportedUrls: await model.supportedUrls,
        download: undefined,
      });

      // Prepare tools
      const { tools: modelTools } = await prepareToolsAndToolChoice({
        tools,
        toolChoice: undefined,
        activeTools: undefined,
      });

      const { tokens, warnings, providerMetadata, response } = await retry(() =>
        recordSpan({
          name: 'ai.countTokens.doCountTokens',
          attributes: selectTelemetryAttributes({
            telemetry,
            attributes: {
              ...assembleOperationName({
                operationId: 'ai.countTokens.doCountTokens',
                telemetry,
              }),
              ...baseTelemetryAttributes,
            },
          }),
          tracer,
          fn: async doCountTokensSpan => {
            const result = await model.doCountTokens!({
              prompt: languageModelPrompt,
              tools: modelTools,
              headers: headersWithUserAgent,
              abortSignal,
              providerOptions,
            });

            doCountTokensSpan.setAttributes(
              await selectTelemetryAttributes({
                telemetry,
                attributes: {
                  'ai.tokens': result.tokens,
                },
              }),
            );

            return result;
          },
        }),
      );

      span.setAttributes(
        await selectTelemetryAttributes({
          telemetry,
          attributes: {
            'ai.tokens': tokens,
          },
        }),
      );

      logWarnings({ warnings, provider: model.provider, model: model.modelId });

      return new DefaultCountTokensResult({
        tokens,
        warnings: warnings ?? [],
        providerMetadata,
        response,
      });
    },
  });
}

class DefaultCountTokensResult implements CountTokensResult {
  readonly tokens: CountTokensResult['tokens'];
  readonly warnings: CountTokensResult['warnings'];
  readonly providerMetadata: CountTokensResult['providerMetadata'];
  readonly response: CountTokensResult['response'];

  constructor(options: {
    tokens: CountTokensResult['tokens'];
    warnings: CountTokensResult['warnings'];
    providerMetadata?: CountTokensResult['providerMetadata'];
    response?: CountTokensResult['response'];
  }) {
    this.tokens = options.tokens;
    this.warnings = options.warnings;
    this.providerMetadata = options.providerMetadata;
    this.response = options.response;
  }
}
