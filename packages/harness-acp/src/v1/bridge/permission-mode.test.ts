import { HarnessBridgeCapabilityUnsupportedError } from '@ai-sdk/harness/bridge';
import * as acp from '@agentclientprotocol/sdk';
import { describe, expect, it, vi } from 'vitest';
import type { ACPPermissionModeMapping } from '../acp-v1-settings';
import { configureACPPermissionMode } from './permission-mode';

const modeMapping = {
  'allow-reads': { type: 'session-mode', modeId: 'read-only' },
  'allow-edits': { type: 'session-mode', modeId: 'agent' },
  'allow-all': { type: 'session-mode', modeId: 'full-access' },
} as const satisfies ACPPermissionModeMapping;

const modeConfiguration = {
  modes: {
    currentModeId: 'agent',
    availableModes: [
      { id: 'read-only', name: 'Read only' },
      { id: 'agent', name: 'Agent' },
      { id: 'full-access', name: 'Full access' },
    ],
  },
  configOptions: null,
} as const satisfies Pick<acp.NewSessionResponse, 'modes' | 'configOptions'>;

function fakeAgent() {
  return {
    request: vi.fn(async () => ({})),
  } as unknown as acp.ClientContext;
}

describe('ACP permission mode configuration', () => {
  it.each([
    { permissionMode: 'allow-reads', modeId: 'read-only' },
    { permissionMode: 'allow-edits', modeId: 'agent' },
    { permissionMode: 'allow-all', modeId: 'full-access' },
  ] as const)(
    'applies Harness mode $permissionMode through session/set_mode',
    async ({ permissionMode, modeId }) => {
      const agent = fakeAgent();

      await configureACPPermissionMode({
        agent,
        sessionId: 'session-1',
        sessionConfiguration: modeConfiguration,
        permissionModeMapping: modeMapping,
        permissionMode,
        harnessId: 'example-acp',
      });

      expect(agent.request).toHaveBeenCalledWith(
        acp.methods.agent.session.setMode,
        {
          sessionId: 'session-1',
          modeId,
        },
      );
    },
  );

  it('rejects an unsupported mode and suggests a mapped allow-all mode', async () => {
    const agent = fakeAgent();
    const mapping = {
      'allow-reads': null,
      'allow-edits': null,
      'allow-all': { type: 'session-mode', modeId: 'full-access' },
    } as const satisfies ACPPermissionModeMapping;

    await expect(
      configureACPPermissionMode({
        agent,
        sessionId: 'session-1',
        sessionConfiguration: modeConfiguration,
        permissionModeMapping: mapping,
        permissionMode: 'allow-reads',
        harnessId: 'example-acp',
      }),
    ).rejects.toThrow(
      `Permission mode "allow-reads" is not supported by this ACP harness. Use permissionMode: 'allow-all'.`,
    );
    expect(agent.request).not.toHaveBeenCalled();
  });

  it('does not suggest allow-all when that mode is also unsupported', async () => {
    const agent = fakeAgent();
    const mapping = {
      'allow-reads': null,
      'allow-edits': { type: 'session-mode', modeId: 'agent' },
      'allow-all': null,
    } as const satisfies ACPPermissionModeMapping;

    let unsupportedError: unknown;
    try {
      await configureACPPermissionMode({
        agent,
        sessionId: 'session-1',
        sessionConfiguration: modeConfiguration,
        permissionModeMapping: mapping,
        permissionMode: 'allow-reads',
        harnessId: 'example-acp',
      });
    } catch (error) {
      unsupportedError = error;
    }
    expect(
      HarnessBridgeCapabilityUnsupportedError.isInstance(unsupportedError),
    ).toBe(true);
    expect(unsupportedError).toMatchObject({
      message:
        'Permission mode "allow-reads" is not supported by this ACP harness.',
    });
    expect(agent.request).not.toHaveBeenCalled();
  });

  it('configures a supported mode when the other mappings are null', async () => {
    const agent = fakeAgent();
    const mapping = {
      'allow-reads': null,
      'allow-edits': null,
      'allow-all': { type: 'session-mode', modeId: 'full-access' },
    } as const satisfies ACPPermissionModeMapping;

    await configureACPPermissionMode({
      agent,
      sessionId: 'session-1',
      sessionConfiguration: modeConfiguration,
      permissionModeMapping: mapping,
      permissionMode: 'allow-all',
      harnessId: 'example-acp',
    });

    expect(agent.request).toHaveBeenCalledWith(
      acp.methods.agent.session.setMode,
      {
        sessionId: 'session-1',
        modeId: 'full-access',
      },
    );
  });

  it('validates grouped select values and applies a config option', async () => {
    const agent = fakeAgent();
    const mapping = {
      'allow-reads': {
        type: 'session-config-option',
        configId: 'mode',
        value: 'read-only',
      },
      'allow-edits': {
        type: 'session-config-option',
        configId: 'mode',
        value: 'agent',
      },
      'allow-all': {
        type: 'session-config-option',
        configId: 'mode',
        value: 'full-access',
      },
    } as const satisfies ACPPermissionModeMapping;

    await configureACPPermissionMode({
      agent,
      sessionId: 'session-1',
      sessionConfiguration: {
        modes: null,
        configOptions: [
          {
            type: 'select',
            id: 'mode',
            name: 'Mode',
            currentValue: 'agent',
            options: [
              {
                group: 'safe',
                name: 'Safe',
                options: [
                  { value: 'read-only', name: 'Read only' },
                  { value: 'agent', name: 'Agent' },
                ],
              },
              {
                group: 'unsafe',
                name: 'Unsafe',
                options: [{ value: 'full-access', name: 'Full access' }],
              },
            ],
          },
        ],
      },
      permissionModeMapping: mapping,
      permissionMode: 'allow-edits',
      harnessId: 'example-acp',
    });

    expect(agent.request).toHaveBeenCalledWith(
      acp.methods.agent.session.setConfigOption,
      {
        sessionId: 'session-1',
        configId: 'mode',
        value: 'agent',
      },
    );
  });

  it('applies boolean config options with the required ACP discriminator', async () => {
    const agent = fakeAgent();
    const mapping = {
      'allow-reads': {
        type: 'session-config-option',
        configId: 'dangerous',
        value: false,
      },
      'allow-edits': {
        type: 'session-config-option',
        configId: 'dangerous',
        value: false,
      },
      'allow-all': {
        type: 'session-config-option',
        configId: 'dangerous',
        value: true,
      },
    } as const satisfies ACPPermissionModeMapping;

    await configureACPPermissionMode({
      agent,
      sessionId: 'session-1',
      sessionConfiguration: {
        modes: null,
        configOptions: [
          {
            type: 'boolean',
            id: 'dangerous',
            name: 'Dangerous',
            currentValue: false,
          },
        ],
      },
      permissionModeMapping: mapping,
      permissionMode: 'allow-all',
      harnessId: 'example-acp',
    });

    expect(agent.request).toHaveBeenCalledWith(
      acp.methods.agent.session.setConfigOption,
      {
        sessionId: 'session-1',
        configId: 'dangerous',
        type: 'boolean',
        value: true,
      },
    );
  });

  it.each([
    {
      name: 'obsolete session mode',
      mapping: {
        ...modeMapping,
        'allow-reads': {
          type: 'session-mode',
          modeId: 'obsolete',
        },
      },
      message:
        '"obsolete", but the agent advertised "read-only", "agent", "full-access"',
    },
    {
      name: 'missing config option',
      mapping: {
        ...modeMapping,
        'allow-reads': {
          type: 'session-config-option',
          configId: 'missing',
          value: 'read-only',
        },
      },
      message: 'requires session configuration "missing"',
    },
  ] as const)(
    'rejects an $name before applying any mode',
    async ({ mapping, message }) => {
      const agent = fakeAgent();

      await expect(
        configureACPPermissionMode({
          agent,
          sessionId: 'session-1',
          sessionConfiguration: modeConfiguration,
          permissionModeMapping: mapping,
          permissionMode: 'allow-all',
          harnessId: 'example-acp',
        }),
      ).rejects.toThrow(message);
      expect(agent.request).not.toHaveBeenCalled();
    },
  );

  it('rejects an obsolete config value with a capability error', async () => {
    const agent = fakeAgent();
    const mapping = {
      'allow-reads': {
        type: 'session-config-option',
        configId: 'mode',
        value: 'obsolete',
      },
      'allow-edits': {
        type: 'session-config-option',
        configId: 'mode',
        value: 'agent',
      },
      'allow-all': {
        type: 'session-config-option',
        configId: 'mode',
        value: 'agent',
      },
    } as const satisfies ACPPermissionModeMapping;

    try {
      await configureACPPermissionMode({
        agent,
        sessionId: 'session-1',
        sessionConfiguration: {
          modes: null,
          configOptions: [
            {
              type: 'select',
              id: 'mode',
              name: 'Mode',
              currentValue: 'agent',
              options: [{ value: 'agent', name: 'Agent' }],
            },
          ],
        },
        permissionModeMapping: mapping,
        permissionMode: 'allow-all',
        harnessId: 'example-acp',
      });
      throw new Error('Expected permission validation to fail.');
    } catch (error) {
      expect(HarnessBridgeCapabilityUnsupportedError.isInstance(error)).toBe(
        true,
      );
      expect(error).toMatchObject({
        harnessId: 'example-acp',
        message: expect.stringContaining(
          'requires value "obsolete" for session configuration "mode"',
        ),
      });
    }
    expect(agent.request).not.toHaveBeenCalled();
  });
});
