import { generateId } from '@ai-sdk/provider-utils';
import { ProviderV2 } from '@ai-sdk/provider';
import { CactusChatLanguageModel } from './cactus-chat-language-model';

export interface CactusChatSettings {}

export interface CactusProvider extends ProviderV2 {
  (modelUrl: string, settings?: CactusChatSettings): CactusChatLanguageModel;

  languageModel(
    modelUrl: string,
    settings?: CactusChatSettings,
  ): CactusChatLanguageModel;
}

export interface CactusProviderSettings {
  model?: any;
  generateId?: () => string;
}

export function createCactus(
  options: CactusProviderSettings = {},
): CactusProvider {
  const createChatModel = (
    modelUrl: string,
    settings: CactusChatSettings = {},
  ) =>
    new CactusChatLanguageModel(modelUrl, settings, {
      provider: 'cactus',
      generateId: options.generateId ?? generateId,
    });

  const provider = function (modelUrl: string, settings?: CactusChatSettings) {
    if (new.target) {
      throw new Error(
        'The model factory function cannot be called with the new keyword.',
      );
    }

    return createChatModel(modelUrl, settings);
  };

  provider.languageModel = createChatModel;

  return provider as CactusProvider;
}

export const cactus = createCactus();