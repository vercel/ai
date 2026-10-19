import { AnthropicMessagesLanguageModel } from '@ai-sdk/anthropic/internal';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import { convertToMiniMaxMediaPart } from './convert-to-minimax-media-part';

type MiniMaxChatConfig = ConstructorParameters<
  typeof AnthropicMessagesLanguageModel
>[1];

export class MiniMaxChatLanguageModel
  extends AnthropicMessagesLanguageModel
  implements LanguageModelV3
{
  private readonly supportsM31Features: boolean;

  constructor(modelId: string, config: MiniMaxChatConfig) {
    // Compare version components as integers: M3.123 is newer than M3.1.
    // Assume later M-series models retain the M3.1 capabilities.
    const version = /^minimax-m(\d+)(?:\.(\d+))?(?:\.\d+)*(?:-|$)/i.exec(
      modelId,
    );
    const supportsM31Features =
      version != null &&
      (Number(version[1]) > 3 ||
        (Number(version[1]) === 3 && Number(version[2] ?? 0) >= 1));

    super(modelId, {
      ...config,
      ...(supportsM31Features && {
        convertMediaPart: convertToMiniMaxMediaPart,
        maxTemperature: 2,
        supportsTemperatureAndTopPWithThinking: true,
        cacheControlProviderOptionsName: 'minimax',
      }),
    });
    this.supportsM31Features = supportsM31Features;
  }

  get supportedUrls() {
    return this.supportsM31Features
      ? { 'image/*': [/^https?:\/\//], 'video/*': [/^https?:\/\//] }
      : super.supportedUrls;
  }
}
