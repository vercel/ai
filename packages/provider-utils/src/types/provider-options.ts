import { 
  SharedV2ProviderOptions,
  SharedV2EmbedProviderOptions,
  SharedV2ImageProviderOptions,
  SharedV2SpeechProviderOptions,
  SharedV2TranscribeProviderOptions 
} from '@ai-sdk/provider';

/**
Additional provider-specific options.

They are passed through to the provider from the AI SDK and enable
provider-specific functionality that can be fully encapsulated in the provider.
 */
export type ProviderOptions = SharedV2ProviderOptions;

/**
Additional provider-specific options for embedding models.

They are passed through to the provider from the AI SDK and enable
provider-specific functionality that can be fully encapsulated in the provider.
 */
export type EmbedProviderOptions = SharedV2EmbedProviderOptions;

/**
Additional provider-specific options for image generation models.

They are passed through to the provider from the AI SDK and enable
provider-specific functionality that can be fully encapsulated in the provider.
 */
export type ImageProviderOptions = SharedV2ImageProviderOptions;

/**
Additional provider-specific options for speech generation models.

They are passed through to the provider from the AI SDK and enable
provider-specific functionality that can be fully encapsulated in the provider.
 */
export type SpeechProviderOptions = SharedV2SpeechProviderOptions;

/**
Additional provider-specific options for transcription models.

They are passed through to the provider from the AI SDK and enable
provider-specific functionality that can be fully encapsulated in the provider.
 */
export type TranscribeProviderOptions = SharedV2TranscribeProviderOptions;
