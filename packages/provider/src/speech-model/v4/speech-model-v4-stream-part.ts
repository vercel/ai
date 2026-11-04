import type { SharedV4AudioFormat, SharedV4Headers } from '../../shared';
import type { SharedV4ProviderMetadata } from '../../shared/v4/shared-v4-provider-metadata';
import type { SharedV4Warning } from '../../shared/v4/shared-v4-warning';
import type { SpeechModelV4StreamUsage } from './speech-model-v4-stream-usage';

export type SpeechModelV4StreamPart =
  | {
      /**
       * Stream start event with warnings for the call, e.g. unsupported settings.
       */
      type: 'stream-start';
      warnings: Array<SharedV4Warning>;
    }
  | {
      /**
       * Output audio chunk, in generation order. Chunks are not necessarily
       * standalone files; concatenate them to reconstruct the audio.
       *
       * `Uint8Array` chunks contain raw audio bytes. `string` chunks contain
       * base64-encoded raw audio bytes.
       *
       * A chunk may be empty when it only carries `providerMetadata` for a
       * point in the audio, e.g. a provider's end-of-turn marker.
       */
      type: 'audio';

      /**
       * Optional provider identifier for the chunk.
       */
      id?: string;

      audio: Uint8Array | string;

      /**
       * Format of the audio chunk, e.g. `{ type: 'audio/mpeg' }` or
       * `{ type: 'audio/pcm', rate: 24000 }`.
       */
      audioFormat: SharedV4AudioFormat;

      providerMetadata?: SharedV4ProviderMetadata;
    }
  | {
      /**
       * Metadata for the response, emitted once available.
       */
      type: 'response-metadata';
      timestamp?: Date;
      modelId?: string;
      headers?: SharedV4Headers;
      body?: unknown;
    }
  | {
      /**
       * Metadata that is available after the stream is finished. Emitted
       * exactly once, after all audio chunks.
       */
      type: 'finish';

      /**
       * Usage information for the call, if known.
       */
      usage?: SpeechModelV4StreamUsage;

      /**
       * Additional provider-specific metadata.
       */
      providerMetadata?: SharedV4ProviderMetadata;
    }
  | {
      /**
       * Raw provider chunks if enabled.
       */
      type: 'raw';
      rawValue: unknown;
    }
  | {
      /**
       * A non-fatal error; the stream continues and may carry more of them.
       * Providers signal an unrecoverable failure by erroring the stream, or
       * by closing it without a `finish` part.
       */
      type: 'error';
      error: unknown;
    };
