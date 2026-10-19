import {
  InvalidArgumentError,
  type LanguageModelV4CallOptions,
  type LanguageModelV4GenerateResult,
  type LanguageModelV4StreamPart,
  type LanguageModelV4StreamResult,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import { AnthropicLanguageModel } from '@ai-sdk/anthropic/internal';
import {
  parseProviderOptions,
  WORKFLOW_DESERIALIZE,
} from '@ai-sdk/provider-utils';
import { minimaxLanguageModelOptions } from './minimax-chat-options';

const MAX_OUTPUT_TOKENS = 524288;

export function isMiniMaxM31OrLater(modelId: string): boolean {
  const version = /^minimax-m(\d+)(?:\.(\d+))?(?:-|$)/i.exec(modelId);
  if (version == null) return false;
  const major = Number(version[1]);
  const minor = Number(version[2] ?? 0);
  return major > 3 || (major === 3 && minor >= 1);
}

export class MiniMaxM31LanguageModel extends AnthropicLanguageModel {
  static override [WORKFLOW_DESERIALIZE](options: {
    modelId: ConstructorParameters<typeof AnthropicLanguageModel>[0];
    config: ConstructorParameters<typeof AnthropicLanguageModel>[1];
  }) {
    return new MiniMaxM31LanguageModel(options.modelId, options.config);
  }

  private async prepareOptions(
    options: LanguageModelV4CallOptions,
    warnings: SharedV4Warning[],
  ): Promise<LanguageModelV4CallOptions> {
    const providerOptions = {
      ...options.providerOptions?.anthropic,
      ...options.providerOptions?.minimax,
    };
    const thinking = providerOptions.thinking;
    if (
      thinking != null &&
      typeof thinking === 'object' &&
      'type' in thinking &&
      thinking.type !== 'adaptive'
    ) {
      throw new InvalidArgumentError({
        argument: 'providerOptions.minimax.thinking',
        message: `${this.modelId} only supports adaptive thinking. Use effort to control reasoning depth.`,
      });
    }
    const parsed = await parseProviderOptions({
      provider: 'minimax',
      providerOptions: { minimax: providerOptions },
      schema: minimaxLanguageModelOptions,
    });
    if (parsed?.effort === 'minimal') providerOptions.effort = 'low';

    if (
      options.reasoning != null &&
      options.reasoning !== 'provider-default' &&
      providerOptions.effort == null
    ) {
      if (options.reasoning === 'none') {
        throw new InvalidArgumentError({
          argument: 'reasoning',
          message: `${this.modelId} reasoning cannot be disabled. Use a lower effort instead.`,
        });
      }
      providerOptions.effort =
        options.reasoning === 'minimal' ? 'low' : options.reasoning;
    }

    const isFlash = this.modelId.toLowerCase() === 'minimax-m3.1-flash';
    if (
      isFlash &&
      options.maxOutputTokens != null &&
      options.maxOutputTokens > MAX_OUTPUT_TOKENS
    ) {
      warnings.push({
        type: 'unsupported',
        feature: 'maxOutputTokens',
        details: `MiniMax-M3.1-Flash supports at most ${MAX_OUTPUT_TOKENS} output tokens. The output-token limit has been reduced to ${MAX_OUTPUT_TOKENS}.`,
      });
    }
    return {
      ...options,
      reasoning: 'provider-default',
      maxOutputTokens: isFlash
        ? Math.min(options.maxOutputTokens ?? 131072, MAX_OUTPUT_TOKENS)
        : options.maxOutputTokens,
      providerOptions: { ...options.providerOptions, minimax: providerOptions },
    };
  }

  override async doGenerate(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4GenerateResult> {
    const warnings: SharedV4Warning[] = [];
    const result = await super.doGenerate(
      await this.prepareOptions(options, warnings),
    );
    return { ...result, warnings: [...warnings, ...result.warnings] };
  }

  override async doStream(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4StreamResult> {
    const warnings: SharedV4Warning[] = [];
    const result = await super.doStream(
      await this.prepareOptions(options, warnings),
    );
    if (warnings.length === 0) return result;
    return {
      ...result,
      stream: result.stream.pipeThrough(
        new TransformStream<
          LanguageModelV4StreamPart,
          LanguageModelV4StreamPart
        >({
          transform(part, controller) {
            controller.enqueue(
              part.type === 'stream-start'
                ? { ...part, warnings: [...warnings, ...part.warnings] }
                : part,
            );
          },
        }),
      ),
    };
  }
}
