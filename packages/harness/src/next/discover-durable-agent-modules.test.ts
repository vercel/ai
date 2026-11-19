import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  discoverDurableHarnessAgentModules,
  exportsHarnessAgent,
} from './discover-durable-agent-modules';

describe('exportsHarnessAgent', () => {
  test.each([
    {
      case: 'an exported constant',
      code: `import { HarnessAgent } from '@ai-sdk/harness/agent';
export const agent = new HarnessAgent({ id: 'a' });`,
    },
    {
      case: 'an import from the package root',
      code: `import { HarnessAgent } from '@ai-sdk/harness';
export const agent = new HarnessAgent({ id: 'a' });`,
    },
    {
      case: 'an aliased import',
      code: `import { HarnessAgent as Agent } from '@ai-sdk/harness/agent';
export const agent = new Agent({ id: 'a' });`,
    },
    {
      case: 'a namespace import',
      code: `import * as harness from '@ai-sdk/harness/agent';
export const agent = new harness.HarnessAgent({ id: 'a' });`,
    },
    {
      case: 'a default export',
      code: `import { HarnessAgent } from '@ai-sdk/harness/agent';
export default new HarnessAgent({ id: 'a' });`,
    },
    {
      case: 'a constant exported by name',
      code: `import { HarnessAgent } from '@ai-sdk/harness/agent';
const agent = new HarnessAgent({ id: 'a' });
export { agent as supportAgent };`,
    },
    {
      case: 'a constant exported as default',
      code: `import { HarnessAgent } from '@ai-sdk/harness/agent';
const agent = new HarnessAgent({ id: 'a' });
export default agent;`,
    },
    {
      case: 'an agent inside a module-scope expression',
      code: `import { HarnessAgent } from '@ai-sdk/harness/agent';
export const agent = (globalThis.cached ??= new HarnessAgent({ id: 'a' })) as HarnessAgent;`,
    },
  ])('matches $case', ({ code }) => {
    expect(exportsHarnessAgent({ code, file: 'agent.ts' })).toBe(true);
  });

  test.each([
    {
      case: 'an agent created in a function',
      code: `import { HarnessAgent } from '@ai-sdk/harness/agent';
export const createAgent = () => new HarnessAgent({ id: 'a' });`,
    },
    {
      case: 'an agent that is not exported',
      code: `import { HarnessAgent } from '@ai-sdk/harness/agent';
const agent = new HarnessAgent({ id: 'a' });`,
    },
    {
      case: 'a HarnessAgent from another package',
      code: `import { HarnessAgent } from 'other-package';
export const agent = new HarnessAgent({ id: 'a' });`,
    },
    {
      case: 'a type-only import',
      code: `import type { HarnessAgent } from '@ai-sdk/harness/agent';
export const agent = new HarnessAgent({ id: 'a' });`,
    },
    {
      case: 'code that does not parse',
      code: `import { HarnessAgent } from '@ai-sdk/harness/agent';
export const agent = new HarnessAgent({`,
    },
  ])('does not match $case', ({ code }) => {
    expect(exportsHarnessAgent({ code, file: 'agent.ts' })).toBe(false);
  });

  test('parses JSX in a .tsx file', () => {
    expect(
      exportsHarnessAgent({
        code: `import { HarnessAgent } from '@ai-sdk/harness/agent';
export const agent = new HarnessAgent({ id: 'a' });
export const view = <div />;`,
        file: 'agent.tsx',
      }),
    ).toBe(true);
  });
});

describe('discoverDurableHarnessAgentModules', () => {
  test('finds the modules that export an agent, outside ignored directories', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'harness-discover-'));
    const agentCode = `import { HarnessAgent } from '@ai-sdk/harness/agent';
export const agent = new HarnessAgent({ id: 'a' });`;
    for (const dir of ['agent', 'node_modules/pkg', '.next/server', 'lib']) {
      mkdirSync(join(projectDir, dir), { recursive: true });
    }
    writeFileSync(join(projectDir, 'agent/basic.ts'), agentCode);
    writeFileSync(join(projectDir, 'node_modules/pkg/index.js'), agentCode);
    writeFileSync(join(projectDir, '.next/server/agent.js'), agentCode);
    writeFileSync(join(projectDir, 'lib/utils.ts'), 'export const a = 1;');

    expect(discoverDurableHarnessAgentModules({ projectDir })).toEqual([
      join(projectDir, 'agent/basic.ts'),
    ]);
  });
});
