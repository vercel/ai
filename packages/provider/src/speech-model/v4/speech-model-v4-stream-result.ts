import type { SharedV4ProviderMetadata } from '../../shared';
import type { SpeechModelV4Result } from './speech-model-v4-result';

/** Incremental audio followed by exactly one finish event. */
export type SpeechModelV4StreamPart =
  | {
      type: 'audio';
      audio: string | Uint8Array;
      mediaType: string;
      providerMetadata?: SharedV4ProviderMetadata;
    }
  | {
      type: 'finish';
      finishReason: {
        unified: 'stop' | 'length' | 'content-filter' | 'error' | 'other';
        raw?: string;
      };
      usage: {
        inputTokens?: number;
        outputTokens?: number;
      };
      providerMetadata?: SharedV4ProviderMetadata;
    };

/** The result of a streaming speech request. Stream failures reject reads. */
export type SpeechModelV4StreamResult = {
  stream: ReadableStream<SpeechModelV4StreamPart>;
  warnings: SpeechModelV4Result['warnings'];
  request?: SpeechModelV4Result['request'];
  response: SpeechModelV4Result['response'];
};
