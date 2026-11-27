import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { createDurableHarnessAgentVercelFunctionsConfig } from './create-durable-harness-agent-vercel-functions-config';

describe('createDurableHarnessAgentVercelFunctionsConfig', () => {
  test('returns the queue trigger of the generated queue handler route', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'harness-vercel-'));
    mkdirSync(join(projectDir, 'app'));

    expect(createDurableHarnessAgentVercelFunctionsConfig({ projectDir }))
      .toMatchInlineSnapshot(`
        {
          "app/.well-known/harness-agent/v1/flow/route.js": {
            "experimentalTriggers": [
              {
                "initialDelaySeconds": 0,
                "retryAfterSeconds": 5,
                "topic": "__harnessagent_wkf_workflow_*",
                "type": "queue/v2beta",
              },
            ],
            "maxDuration": "max",
          },
        }
      `);
  });

  test('returns the entry of the app its own route', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'harness-vercel-'));
    const routeDir = join(
      projectDir,
      'src/app/.well-known/harness-agent/v1/flow',
    );
    mkdirSync(routeDir, { recursive: true });
    writeFileSync(join(routeDir, 'route.ts'), 'export const POST = () => {};');

    expect(
      Object.keys(
        createDurableHarnessAgentVercelFunctionsConfig({ projectDir }),
      ),
    ).toEqual(['src/app/.well-known/harness-agent/v1/flow/route.ts']);
  });

  test('throws without an app directory', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'harness-vercel-'));

    expect(() =>
      createDurableHarnessAgentVercelFunctionsConfig({ projectDir }),
    ).toThrow('no Next.js app directory');
  });
});
