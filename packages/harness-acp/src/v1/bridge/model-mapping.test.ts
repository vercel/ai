import type * as acp from '@agentclientprotocol/sdk';
import { describe, expect, it, vi } from 'vitest';
import { configureACPModel } from './model-mapping';

function mockAgent(response: unknown = {}) {
  const request = vi.fn(async () => response);
  return {
    agent: { request } as unknown as acp.ClientContext,
    request,
  };
}

describe('configureACPModel', () => {
  it('sets a standard ACP session config option', async () => {
    const { agent, request } = mockAgent();

    const modelId = await configureACPModel({
      agent,
      sessionId: 'session-1',
      model: 'claude-haiku-4-5',
      mapping: {
        type: 'session-config-option',
        path: 'model',
      },
    });

    expect(modelId).toBe('claude-haiku-4-5');
    expect(request).toHaveBeenCalledExactlyOnceWith(
      'session/set_config_option',
      {
        sessionId: 'session-1',
        configId: 'model',
        value: 'claude-haiku-4-5',
      },
    );
  });

  it('returns the model reported by the config option response', async () => {
    const { agent } = mockAgent({
      configOptions: [
        {
          type: 'select',
          id: 'model',
          currentValue: 'claude-haiku-4-5-20251001',
        },
      ],
    });

    const modelId = await configureACPModel({
      agent,
      sessionId: 'session-1',
      model: 'claude-haiku-4-5',
      mapping: {
        type: 'session-config-option',
        path: 'model',
      },
    });

    expect(modelId).toBe('claude-haiku-4-5-20251001');
  });

  it('sets a model through the legacy Grok Build method', async () => {
    const { agent, request } = mockAgent();

    const modelId = await configureACPModel({
      agent,
      sessionId: 'session-1',
      model: 'grok-build-0.1',
      mapping: {
        type: 'session-model',
        path: 'modelId',
      },
    });

    expect(modelId).toBe('grok-build-0.1');
    expect(request).toHaveBeenCalledExactlyOnceWith('session/set_model', {
      sessionId: 'session-1',
      modelId: 'grok-build-0.1',
    });
  });

  it('returns the model reported by the session model response', async () => {
    const { agent } = mockAgent({
      models: { currentModelId: 'grok-build-0.1-resolved' },
    });

    const modelId = await configureACPModel({
      agent,
      sessionId: 'session-1',
      model: 'grok-build-0.1',
      mapping: {
        type: 'session-model',
        path: 'modelId',
      },
    });

    expect(modelId).toBe('grok-build-0.1-resolved');
  });

  it('does not configure a model when none is requested', async () => {
    const { agent, request } = mockAgent();

    const modelId = await configureACPModel({
      agent,
      sessionId: 'session-1',
      model: undefined,
      mapping: {
        type: 'session-config-option',
        path: 'model',
      },
    });

    expect(modelId).toBeUndefined();
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects a model without its mapping', async () => {
    const { agent } = mockAgent();

    await expect(
      configureACPModel({
        agent,
        sessionId: 'session-1',
        model: 'claude-haiku-4-5',
        mapping: undefined,
      }),
    ).rejects.toThrow('ACP model mapping is required when a model is set.');
  });
});
