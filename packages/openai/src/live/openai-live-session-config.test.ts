import { describe, expect, it } from 'vitest';
import { createOpenAI } from '../index';
import {
  openaiRealtimeModelLiveOptionsSchema,
  openaiRealtimeModelLiveUpdateOptionsSchema,
} from './openai-realtime-model-live-options';

const model = createOpenAI().experimental_live('gpt-live-1');

describe('Live startup and update options', () => {
  it('requires the backend model only at startup and supplies the update discriminator', () => {
    const options = { delegation: { responses: { instructions: '' } } };
    expect(
      openaiRealtimeModelLiveOptionsSchema.safeParse({
        delegation: { type: 'responses', responses: {} },
      }).success,
    ).toBe(false);
    expect(openaiRealtimeModelLiveUpdateOptionsSchema.parse(options)).toEqual(
      options,
    );
    expect(
      model.serializeClientEvent({
        type: 'session-update',
        eventId: 'update-1',
        config: { providerOptions: { openai: options } },
      }),
    ).toEqual({
      type: 'session.update',
      event_id: 'update-1',
      session: {
        delegation: { type: 'responses', responses: { instructions: '' } },
      },
    });
  });

  it.each([
    {
      instructions: '',
      maxOutputTokens: 64,
      parallelToolCalls: false,
      serviceTier: 'priority',
    },
    {
      instructions: null,
      maxOutputTokens: null,
      parallelToolCalls: null,
      serviceTier: null,
      reasoning: null,
      text: null,
    },
    { reasoning: { effort: null, summary: null }, text: { verbosity: null } },
    { instructions: '', parallelToolCalls: false, tools: [] },
    { tools: [{ type: 'function', name: 'ping' }] },
    {
      tools: [
        {
          type: 'function',
          name: 'ping',
          description: null,
          strict: null,
          parameters: null,
        },
      ],
    },
  ])(
    'preserves nullable and empty backend options at both boundaries: %j',
    responses => {
      const wire = Object.fromEntries(
        Object.entries(responses).map(([key, value]) => [
          (
            {
              maxOutputTokens: 'max_output_tokens',
              parallelToolCalls: 'parallel_tool_calls',
              serviceTier: 'service_tier',
            } as Record<string, string>
          )[key] ?? key,
          value,
        ]),
      );
      expect(
        model.buildSessionConfig({
          providerOptions: {
            openai: {
              delegation: {
                type: 'responses',
                responses: { model: 'backend', ...responses },
              },
            },
          },
        }),
      ).toMatchObject({
        delegation: {
          type: 'responses',
          responses: { model: 'backend', ...wire },
        },
      });
      expect(
        model.serializeClientEvent({
          type: 'session-update',
          config: {
            providerOptions: { openai: { delegation: { responses } } },
          },
        }),
      ).toEqual({
        type: 'session.update',
        session: { delegation: { type: 'responses', responses: wire } },
      });
    },
  );

  it.each([
    { store: false },
    { input: [] },
    { voice: { id: 'voice' } },
    { model: 'replacement' },
    { instructions: '' },
    { audio: { output: { voice: 'marin' } } },
  ])(
    'rejects immutable update fields even alongside valid changes: %j',
    immutable => {
      expect(() =>
        model.serializeClientEvent({
          type: 'session-update',
          config: {
            providerOptions: {
              openai: { delegation: { responses: {} }, ...immutable },
            },
          },
        }),
      ).toThrow();
    },
  );

  it('defaults context to thinking and validates OpenAI command and image options', () => {
    expect(
      model.serializeClientEvent({
        type: 'context-append',
        content: '',
        delegationId: null,
      }),
    ).toEqual({
      type: 'session.thinking.append',
      content: '',
      delegation_id: null,
    });
    expect(() =>
      model.serializeClientEvent({
        type: 'context-append',
        content: 'context',
        delegationId: null,
        providerOptions: { openai: { channel: 'invalid' } },
      }),
    ).toThrow();
    expect(() =>
      model.serializeClientEvent({
        type: 'backend-input-create',
        content: [
          {
            type: 'image',
            url: 'https://example.com/image.png',
            providerOptions: { openai: { imageDetail: 'invalid' } },
          },
        ],
      }),
    ).toThrow();
  });
});
