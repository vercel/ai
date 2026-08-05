import { commonTool } from '@ai-sdk/harness';
import { describe, expectTypeOf, test } from 'vitest';
import { z } from 'zod/v4';
import {
  createACP,
  type ACPHarnessSettings,
  type ACPSettings,
} from './acp-harness';
import type { ACPV1Settings } from './v1';

describe('createACP built-in tool inference', () => {
  test('uses ACPHarnessSettings as the canonical settings type', () => {
    expectTypeOf<ACPSettings>().toEqualTypeOf<ACPHarnessSettings>();
    expectTypeOf<
      Extract<keyof ACPV1Settings, 'builtinTools' | 'port' | 'startupTimeoutMs'>
    >().toEqualTypeOf<never>();
    expectTypeOf<
      Omit<ACPHarnessSettings, 'builtinTools' | 'port' | 'startupTimeoutMs'>
    >().toEqualTypeOf<ACPV1Settings>();
  });

  test('preserves the supplied tool set type', () => {
    const bash = commonTool('bash', {
      nativeName: 'shell',
      inputSchema: z.object({ command: z.string() }),
    });
    const harness = createACP({
      harnessId: 'codex-acp',
      implementation: {
        type: 'npm',
        packageName: '@agentclientprotocol/codex-acp',
        version: '1.1.4',
        executable: 'codex-acp',
      },
      builtinTools: { bash },
    });

    expectTypeOf(harness.builtinTools).toEqualTypeOf<{ bash: typeof bash }>();
  });

  test('accepts locked npm acquisition without changing simple mode', () => {
    createACP({
      harnessId: 'simple-acp',
      implementation: {
        type: 'npm',
        packageName: '@example/acp-agent',
        version: '1.2.3',
        executable: 'acp-agent',
      },
    });
    createACP({
      harnessId: 'locked-acp',
      implementation: {
        type: 'npm',
        mode: 'locked',
        packageJson: '{"private":true}',
        pnpmLockYaml: "lockfileVersion: '9.0'\n",
        executable: 'acp-agent',
      },
    });
  });
});
