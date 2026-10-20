import type {
  Experimental_RealtimeModelV4 as RealtimeModelV4,
  Experimental_RealtimeModelV4ServerEvent as RealtimeModelV4ServerEvent,
} from '@ai-sdk/provider';
import { expectTypeOf, it } from 'vitest';
import {
  openai,
  type Experimental_OpenAIRealtimeModelLive as OpenAIRealtimeModelLive,
  type Experimental_OpenAIRealtimeModelLiveConfig as OpenAIRealtimeModelLiveConfig,
  type Experimental_OpenAIRealtimeModelLiveId as OpenAIRealtimeModelLiveId,
  type Experimental_OpenAIRealtimeModelLiveOptions as OpenAIRealtimeModelLiveOptions,
} from '../index';

it('exports the exact concrete factory return and supported connection methods', () => {
  const model = openai.experimental_realtime('gpt-live-1');
  expectTypeOf(model).toEqualTypeOf<OpenAIRealtimeModelLive>();
  expectTypeOf(model).toMatchTypeOf<RealtimeModelV4>();
  expectTypeOf(model.modelId).toEqualTypeOf<OpenAIRealtimeModelLiveId>();
  expectTypeOf(model.parseServerEvent({})).toEqualTypeOf<
    RealtimeModelV4ServerEvent[]
  >();
  expectTypeOf<OpenAIRealtimeModelLiveConfig>().toMatchTypeOf<{
    provider: string;
    baseURL: string;
  }>();
  expectTypeOf<'live'>().not.toMatchTypeOf<keyof typeof openai>();
  expectTypeOf<'getWebSocketConfig'>().not.toMatchTypeOf<keyof typeof model>();
  expectTypeOf(model.getWebRTCConfig()).toEqualTypeOf<{
    dataChannelLabel: string;
  }>();
  expectTypeOf(model.doCreateWebRTCSession).parameter(0).toMatchTypeOf<{
    sdp: string;
    abortSignal?: AbortSignal;
  }>();
  expectTypeOf(model.doCreateWebRTCSession).returns.toEqualTypeOf<
    Promise<{ sessionId: string; sdp: string }>
  >();
  expectTypeOf<'doCreateClientSecret'>().not.toMatchTypeOf<
    keyof typeof model
  >();
});

it('supports only client delegation with optional native RTC permissions', () => {
  expectTypeOf<OpenAIRealtimeModelLiveOptions['delegation']>().toEqualTypeOf<
    { type: 'client' } | null | undefined
  >();
  expectTypeOf<{}>().toMatchTypeOf<OpenAIRealtimeModelLiveOptions>();
  expectTypeOf<'tools'>().not.toMatchTypeOf<
    keyof OpenAIRealtimeModelLiveOptions
  >();
  expectTypeOf<{
    client: {
      dataChannel: {
        allowedClientEvents: string[];
        allowedServerEvents: Array<{ type: string; responseEvent?: string }>;
      };
    };
  }>().toMatchTypeOf<OpenAIRealtimeModelLiveOptions>();
  expectTypeOf<{
    client: {
      dataChannel: { allowedClientEvents: 'all'; allowedServerEvents: 'all' };
    };
  }>().toMatchTypeOf<OpenAIRealtimeModelLiveOptions>();
});
