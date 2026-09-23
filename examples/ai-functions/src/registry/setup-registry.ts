import { anthropic } from '@ai-sdk/anthropic';
import { elevenLabs } from '@ai-sdk/elevenlabs';
import { fal } from '@ai-sdk/fal';
import { groq } from '@ai-sdk/groq';
import { luma } from '@ai-sdk/luma';
import { mistral } from '@ai-sdk/mistral';
import { openai } from '@ai-sdk/openai';
import { replicate } from '@ai-sdk/replicate';
import { xai } from '@ai-sdk/xai';
import {
  createProviderRegistry,
  customProvider,
  defaultSettingsMiddleware,
  wrapLanguageModel,
} from 'ai';
import 'dotenv/config';

// custom provider with alias names:
const myAnthropic = customProvider({
  languageModels: {
    opus: anthropic('claude-opus-5-5'),
    sonnet: anthropic('claude-sonnet-5'),
    haiku: anthropic('claude-haiku-4-5'),
  },
  fallbackProvider: anthropic,
});

// custom provider with different model settings:
const myOpenAI = customProvider({
  languageModels: {
    // replacement model with custom provider options:
    'gpt-6-astra': wrapLanguageModel({
      model: openai('gpt-6-astra'),
      middleware: defaultSettingsMiddleware({
        settings: {
          providerOptions: {
            openai: {
              reasoningEffort: 'high',
            },
          },
        },
      }),
    }),
    // alias model with custom provider options:
    'gpt-6-astra-high-reasoning': wrapLanguageModel({
      model: openai('gpt-6-astra'),
      middleware: defaultSettingsMiddleware({
        settings: {
          providerOptions: {
            openai: {
              reasoningEffort: 'high',
            },
          },
        },
      }),
    }),
  },
  fallbackProvider: openai,
});

export const registry = createProviderRegistry({
  mistral,
  anthropic: myAnthropic,
  openai: myOpenAI,
  xai,
  groq,
  elevenLabs,
});

registry.languageModel('anthropic:haiku');

const registryWithCustomSeparator = createProviderRegistry(
  {
    mistral,
    anthropic: myAnthropic,
    openai: myOpenAI,
    xai,
    groq,
    elevenLabs,
  },
  { separator: ' > ' },
);

registryWithCustomSeparator.languageModel('anthropic > haiku');

export const myImageModels = customProvider({
  imageModels: {
    recraft: fal.imageModel('recraft-v3'),
    photon: luma.imageModel('photon-flash-1'),
    flux: replicate.imageModel('black-forest-labs/flux-schnell'),
  },
});
