import { commonTool } from '@ai-sdk/harness';
import { describe, expectTypeOf, test } from 'vitest';
import { z } from 'zod/v4';
import { createACP, type ACPHarnessSettings } from './acp-harness';
import type { ACPV1Settings } from './v1';

describe('createACP built-in tool inference', () => {
  test('separates version-independent settings from ACP v1 settings', () => {
    expectTypeOf<
      Extract<
        keyof ACPV1Settings,
        'builtinTools' | 'port' | 'startupTimeoutMs' | 'clientApp'
      >
    >().toEqualTypeOf<never>();
    expectTypeOf<
      Omit<
        ACPHarnessSettings,
        'builtinTools' | 'port' | 'startupTimeoutMs' | 'clientApp'
      >
    >().toEqualTypeOf<ACPV1Settings>();
  });

  test('preserves the supplied tool set type', () => {
    const bash = commonTool('bash', {
      nativeName: 'shell',
      inputSchema: z.object({ command: z.string() }),
    });
    const harness = createACP({
      harnessId: 'codex-acp',
      source: {
        type: 'npm-simple',
        packageName: '@agentclientprotocol/codex-acp',
        packageVersion: '1.1.4',
      },
      executable: 'codex-acp',
      builtinTools: { bash },
      clientApp: { name: 'example-app', version: '1.2.3' },
    });

    expectTypeOf(harness.builtinTools).toEqualTypeOf<{ bash: typeof bash }>();
  });

  test('accepts discriminated simple and locked npm sources', () => {
    createACP({
      harnessId: 'simple-acp',
      source: {
        type: 'npm-simple',
        packageName: '@example/acp-agent',
        packageVersion: '1.2.3',
      },
      executable: 'acp-agent',
    });
    createACP({
      harnessId: 'unpinned-acp',
      source: {
        type: 'npm-simple',
        packageName: '@example/acp-agent',
      },
      executable: 'acp-agent',
    });
    createACP({
      harnessId: 'locked-acp',
      source: {
        type: 'npm-locked',
        packageJson: '{"private":true}',
        pnpmLockYaml: "lockfileVersion: '9.0'\n",
      },
      executable: 'acp-agent',
    });
  });
});
