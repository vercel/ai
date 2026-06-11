import { AnthropicLanguageModel } from '@ai-sdk/anthropic/internal';
import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamResult,
} from '@ai-sdk/provider';

/**
 * Language model for Anthropic models served via the Neon AI Gateway's native
 * Messages API (`/ai-gateway/anthropic/v1/messages`). This route unlocks
 * streaming structured output and native reasoning for Claude.
 *
 * The shared Anthropic model defaults to fine-grained tool-input streaming
 * (`eager_input_streaming: true`) on streaming tool calls, which the gateway
 * rejects (`Extra inputs are not permitted`). We disable it via the model's own
 * `toolStreaming` option so streaming tool calls work through the gateway.
 * Users can still override it explicitly.
 */
export class NeonAnthropicLanguageModel
  extends AnthropicLanguageModel
  implements LanguageModelV4
{
  private withGatewayCompat(
    options: LanguageModelV4CallOptions,
  ): LanguageModelV4CallOptions {
    const anthropic = options.providerOptions?.anthropic;
    // Respect an explicit user setting.
    if (anthropic != null && 'toolStreaming' in anthropic) {
      return options;
    }
    return {
      ...options,
      providerOptions: {
        ...options.providerOptions,
        anthropic: { ...anthropic, toolStreaming: false },
      },
    };
  }

  override doGenerate(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4GenerateResult> {
    return super.doGenerate(this.withGatewayCompat(options));
  }

  override doStream(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4StreamResult> {
    return super.doStream(this.withGatewayCompat(options));
  }
}
