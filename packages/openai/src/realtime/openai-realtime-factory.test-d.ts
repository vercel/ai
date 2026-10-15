import type {
  Experimental_RealtimeFactoryV4 as RealtimeFactoryV4,
  Experimental_RealtimeModelV4 as RealtimeModelV4,
} from '@ai-sdk/provider';
import { expectTypeOf, it } from 'vitest';
import {
  openai,
  type Experimental_OpenAIRealtimeFactory as OpenAIRealtimeFactory,
  type Experimental_OpenAIRealtimeOptions as OpenAIRealtimeOptions,
  type Experimental_OpenAIRealtimeModel as OpenAIRealtimeModel,
  type Experimental_OpenAIRealtimeModelLive as OpenAIRealtimeModelLive,
  type Experimental_OpenAIRealtimeModelLiveId as OpenAIRealtimeModelLiveId,
} from '../index';

it('returns concrete Live models for exact known IDs and explicit overrides', () => {
  expectTypeOf(
    openai.experimental_realtime('gpt-live-1'),
  ).toEqualTypeOf<OpenAIRealtimeModelLive>();
  expectTypeOf(
    openai.experimental_realtime('gpt-live-1', undefined),
  ).toEqualTypeOf<OpenAIRealtimeModelLive>();
  expectTypeOf(
    openai.experimental_realtime('gpt-live-1', {}),
  ).toEqualTypeOf<OpenAIRealtimeModelLive>();
  expectTypeOf(
    openai.experimental_realtime('gpt-live-1', { api: undefined }),
  ).toEqualTypeOf<OpenAIRealtimeModelLive>();
  expectTypeOf(
    openai.experimental_realtime('not-yet-released', { api: 'live' }),
  ).toEqualTypeOf<OpenAIRealtimeModelLive>();
  expectTypeOf(
    openai.experimental_realtime('gpt-live-1', { api: 'realtime' }),
  ).toEqualTypeOf<OpenAIRealtimeModel>();
  expectTypeOf(
    openai.experimental_realtime('gpt-live-1').getServerWebSocketConfig,
  ).toBeFunction();
  expectTypeOf(
    openai.experimental_realtime('gpt-live-1').createServerEventParser,
  ).toBeFunction();
  expectTypeOf<'experimental_live'>().not.toMatchTypeOf<keyof typeof openai>();
});

it('returns the shared contract for broad model IDs or selectors', () => {
  const modelId = 'model' as string;
  const liveModelId = 'model' as OpenAIRealtimeModelLiveId;
  const unionId = 'gpt-live-1' as 'gpt-live-1' | 'gpt-realtime';
  const options = {} as OpenAIRealtimeOptions;
  type Model = RealtimeModelV4;
  expectTypeOf(openai.experimental_realtime(modelId)).toEqualTypeOf<Model>();
  expectTypeOf(
    openai.experimental_realtime(liveModelId),
  ).toEqualTypeOf<Model>();
  expectTypeOf(openai.experimental_realtime(unionId)).toEqualTypeOf<Model>();
  expectTypeOf(
    openai.experimental_realtime(modelId, undefined),
  ).toEqualTypeOf<Model>();
  expectTypeOf(
    openai.experimental_realtime('gpt-live-1', options),
  ).toEqualTypeOf<Model>();
  expectTypeOf(
    openai.experimental_realtime(modelId, { api: 'live' }),
  ).toEqualTypeOf<OpenAIRealtimeModelLive>();
  expectTypeOf(
    openai.experimental_realtime(modelId, { api: 'realtime' }),
  ).toEqualTypeOf<OpenAIRealtimeModel>();
  expectTypeOf(
    openai.experimental_realtime(modelId, {
      api: 'live' as 'live' | 'realtime',
    }),
  ).toEqualTypeOf<Model>();
});

it('supports optional transport calls for broad and literal legacy IDs', () => {
  const modelId = 'model' as string;
  const broadModel = openai.experimental_realtime(modelId);
  const legacyModel = openai.experimental_realtime('gpt-realtime');
  expectTypeOf(broadModel).toEqualTypeOf<RealtimeModelV4>();
  expectTypeOf(legacyModel).toEqualTypeOf<RealtimeModelV4>();

  for (const model of [broadModel, legacyModel]) {
    expectTypeOf(
      model.getWebSocketConfig?.({
        token: 'token',
        url: 'wss://example.com/realtime',
      }),
    ).toEqualTypeOf<
      ReturnType<NonNullable<RealtimeModelV4['getWebSocketConfig']>> | undefined
    >();
    expectTypeOf(model.getServerWebSocketConfig?.()).toEqualTypeOf<
      | ReturnType<NonNullable<RealtimeModelV4['getServerWebSocketConfig']>>
      | undefined
    >();
    expectTypeOf(
      model.capabilities?.connections?.includes('server-websocket'),
    ).toEqualTypeOf<boolean | undefined>();
  }
});

it('is assignable to a generic factory with standard getToken options', () => {
  const factory: RealtimeFactoryV4 = openai.experimental_realtime;
  expectTypeOf(
    openai.experimental_realtime,
  ).toEqualTypeOf<OpenAIRealtimeFactory>();
  expectTypeOf(factory('model')).toEqualTypeOf<RealtimeModelV4>();
  expectTypeOf<Parameters<RealtimeFactoryV4['getToken']>[0]>().toMatchTypeOf<
    Parameters<OpenAIRealtimeFactory['getToken']>[0]
  >();
  expectTypeOf<ReturnType<OpenAIRealtimeFactory['getToken']>>().toEqualTypeOf<
    ReturnType<RealtimeFactoryV4['getToken']>
  >();
  expectTypeOf<{
    model: string;
    api: 'live';
    expiresAfterSeconds: number;
  }>().toMatchTypeOf<Parameters<OpenAIRealtimeFactory['getToken']>[0]>();
  expectTypeOf<'api'>().not.toMatchTypeOf<
    keyof Parameters<RealtimeFactoryV4['getToken']>[0]
  >();
  expectTypeOf<{ api: 'bogus' }>().not.toMatchTypeOf<OpenAIRealtimeOptions>();
});
