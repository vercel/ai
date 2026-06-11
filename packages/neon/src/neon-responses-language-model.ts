import { OpenAIResponsesLanguageModel } from '@ai-sdk/openai/internal';
import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamResult,
} from '@ai-sdk/provider';

/**
 * Language model for OpenAI models served via the Neon AI Gateway's native
 * Responses API (`/ai-gateway/openai/v1/responses`). This route is required for
 * models that are only served natively (e.g. Codex) and unlocks native
 * reasoning and the image-generation tool.
 *
 * The shared OpenAI Responses model decides how to shape a request (reasoning
 * parameter handling, system→developer message mapping, `max_completion_tokens`,
 * etc.) based on whether the model is a reasoning model — but it detects that
 * from the bare model id (`gpt-5`), which the gateway's required `databricks-`
 * prefix defeats. For the GPT-5 reasoning family we therefore set the model's
 * own `forceReasoning` provider option so it applies the correct reasoning
 * behavior. Users can still override it explicitly.
 */
export class NeonResponsesLanguageModel
  extends OpenAIResponsesLanguageModel
  implements LanguageModelV4
{
  private get isReasoningFamily(): boolean {
    return /gpt-5/.test(this.modelId.toLowerCase());
  }

  private withForcedReasoning(
    options: LanguageModelV4CallOptions,
  ): LanguageModelV4CallOptions {
    if (!this.isReasoningFamily) {
      return options;
    }
    const openai = options.providerOptions?.openai;
    // Respect an explicit user setting.
    if (openai != null && 'forceReasoning' in openai) {
      return options;
    }
    return {
      ...options,
      providerOptions: {
        ...options.providerOptions,
        openai: { ...openai, forceReasoning: true },
      },
    };
  }

  override doGenerate(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4GenerateResult> {
    return super.doGenerate(this.withForcedReasoning(options));
  }

  override doStream(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4StreamResult> {
    return super.doStream(this.withForcedReasoning(options));
  }
}
