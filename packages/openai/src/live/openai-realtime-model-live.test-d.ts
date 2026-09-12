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
  type Experimental_OpenAIRealtimeModelLiveUpdateOptions as OpenAIRealtimeModelLiveUpdateOptions,
} from '../index';

it('exports the exact concrete factory return and supported connection methods', () => {
  const model = openai.experimental_live('gpt-live-1');
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
  expectTypeOf<'doCreateClientSecret'>().not.toMatchTypeOf<
    keyof typeof model
  >();
});

it('requires a startup backend model but permits mutable updates without one', () => {
  type StartupResponses = Extract<
    OpenAIRealtimeModelLiveOptions['delegation'],
    { type: 'responses' }
  >['responses'];
  type UpdateResponses =
    OpenAIRealtimeModelLiveUpdateOptions['delegation']['responses'];
  expectTypeOf<StartupResponses>().toMatchTypeOf<{ model: string }>();
  expectTypeOf<{}>().not.toMatchTypeOf<StartupResponses>();
  expectTypeOf<{}>().toMatchTypeOf<UpdateResponses>();
  expectTypeOf<{ model: null }>().not.toMatchTypeOf<UpdateResponses>();
  expectTypeOf<{
    model: string;
    instructions: null;
    maxOutputTokens: null;
    parallelToolCalls: null;
    serviceTier: null;
    reasoning: { effort: null; summary: null };
    text: { verbosity: null };
    tools: [
      {
        type: 'function';
        name: string;
        parameters: null;
        description: null;
        strict: null;
      },
    ];
  }>().toMatchTypeOf<StartupResponses>();
  expectTypeOf<{
    tools: [{ type: 'function'; name: string }];
  }>().toMatchTypeOf<UpdateResponses>();
  expectTypeOf<'client'>().not.toMatchTypeOf<
    keyof OpenAIRealtimeModelLiveUpdateOptions
  >();
  expectTypeOf<{
    client: {
      dataChannel: {
        allowedClientEvents: string[] | 'all';
        allowedServerEvents: { type: string; responseEvent?: string }[] | 'all';
      };
    };
  }>().toMatchTypeOf<OpenAIRealtimeModelLiveOptions>();
});
