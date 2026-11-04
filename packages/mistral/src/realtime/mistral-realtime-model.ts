import {
  UnsupportedFunctionalityError,
  type Experimental_RealtimeModelV4 as RealtimeModelV4,
  type Experimental_RealtimeModelV4ClientEvent as RealtimeModelV4ClientEvent,
  type Experimental_RealtimeModelV4SessionConfig as RealtimeModelV4SessionConfig,
  type Experimental_RealtimeModelV4TransportOptions as RealtimeModelV4TransportOptions,
} from '@ai-sdk/provider';
import type { MistralChatModelId } from '../mistral-chat-language-model-options';
import { buildMistralRealtimeSessionConfig } from './mistral-realtime-model-options';
import {
  MistralRealtimeTransport,
  parseMistralRealtimeEvent,
} from './mistral-realtime-transport';

/** A managed Mistral voice agent with provider-owned LiveKit transport. */
export class MistralRealtimeModel implements RealtimeModelV4 {
  readonly specificationVersion = 'v4';
  readonly provider = 'mistral.realtime';
  readonly capabilities = {
    conversation: 'turn-based',
    transports: ['webrtc'],
    connections: ['provider'],
    startup: 'session-update',
    finalization: 'transport-close',
  } as const;

  constructor(readonly modelId: MistralChatModelId) {}

  createTransport(options: RealtimeModelV4TransportOptions) {
    return new MistralRealtimeTransport(options);
  }

  parseServerEvent(raw: unknown) {
    return parseMistralRealtimeEvent(raw);
  }

  serializeClientEvent(event: RealtimeModelV4ClientEvent): never {
    throw new UnsupportedFunctionalityError({
      functionality: `Mistral voice agent ${event.type} outside its provider transport`,
    });
  }

  buildSessionConfig(config: RealtimeModelV4SessionConfig) {
    return buildMistralRealtimeSessionConfig(config, { modelId: this.modelId });
  }
}
