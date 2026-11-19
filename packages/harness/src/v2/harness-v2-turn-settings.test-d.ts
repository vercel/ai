import { expectTypeOf, test } from 'vitest';
import type {
  HarnessV2McpServerConfig,
  HarnessV2TurnSettings,
} from './harness-v2-turn-settings';

test('accepts remote HTTP servers without requiring a transport discriminator', () => {
  expectTypeOf<{
    url: string;
    headers: { authorization: string };
  }>().toExtend<HarnessV2McpServerConfig>();
  expectTypeOf<HarnessV2McpServerConfig['type']>().toEqualTypeOf<
    'http' | undefined
  >();
  expectTypeOf<HarnessV2TurnSettings['mcpServers']>().toEqualTypeOf<
    Readonly<Record<string, HarnessV2McpServerConfig>> | undefined
  >();
});
