import type { ExtensionFactory } from '@earendil-works/pi-coding-agent';
import { expectTypeOf, test } from 'vitest';
import {
  createPi,
  type PiCredentialStore,
  type PiHarnessExtensionSession,
  type PiHarnessSettings,
  type PiFileToolPathPolicy,
  type PiMcpServerConfig,
} from './index';

test('PiHarnessSettings accepts readonly extension factory arrays', () => {
  const extensionFactories = [
    pi => {
      pi.on('agent_start', () => {});
    },
  ] as const satisfies NonNullable<PiHarnessSettings['extensionFactories']>;
  const settings: PiHarnessSettings = { extensionFactories };

  expectTypeOf(settings.extensionFactories).toEqualTypeOf<
    PiHarnessSettings['extensionFactories']
  >();
  createPi(settings);
});

test('createPi accepts plain Pi extension factories and session-aware ones', () => {
  const piFactory: ExtensionFactory = pi => {
    pi.on('agent_start', () => {});
  };
  createPi({
    extensionFactories: [
      piFactory,
      (pi, session) => {
        expectTypeOf(session).toEqualTypeOf<PiHarnessExtensionSession>();
        expectTypeOf(session.instructions()).toEqualTypeOf<
          string | undefined
        >();
        pi.on('agent_start', () => {});
      },
    ],
  });
});

test('createPi accepts the max thinking level', () => {
  createPi({ thinkingLevel: 'max' });
});

test('createPi accepts explicit provider model configurations', () => {
  createPi({
    providers: {
      myprovider: {
        api: 'openai-completions',
        models: [
          {
            id: 'my-custom-model',
            name: 'My Custom Model',
            reasoning: false,
            input: ['text'],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 128_000,
            maxTokens: 16_384,
          },
        ],
      },
    },
  });
});

test('createPi accepts an injected credential store and reattach opt-out', () => {
  const credentials = {} as PiCredentialStore;
  createPi({ credentials, reattachInProcess: false });
});

test('createPi accepts a file tool path policy with readonly roots', () => {
  const readableRoots = ['/home/vercel-sandbox', '/tmp'] as const;
  const deniedRoots = ['/home/vercel-sandbox/.credentials'] as const;
  const writableRoots = ['/tmp/artifacts'] as const;
  const policy = {
    readableRoots,
    writableRoots,
    deniedRoots,
  } satisfies PiFileToolPathPolicy;
  createPi({ fileToolPathPolicy: policy });
  createPi({ fileToolPathPolicy: {} });
});

test('PiMcpServerConfig describes native MCP server configs', () => {
  createPi({
    mcpServers: {
      brand: {
        url: 'https://x',
        headers: { Authorization: 'Bearer t' },
        exposure: 'deferred',
      },
      memory: {
        command: 'memory-mcp',
        args: [],
        toolExposure: { secret: 'hidden' },
      },
    } satisfies Record<string, PiMcpServerConfig>,
  });
  const acceptConfig = (_config: PiMcpServerConfig) => {};
  // @ts-expect-error
  acceptConfig({ url: 'https://x', exposure: 'codemode' });
  // @ts-expect-error
  acceptConfig({ command: 'memory-mcp', lifecycle: 'eager' });
});

test('createPi accepts deprecated MCP adapter settings', () => {
  createPi({ mcpSettings: { toolPrefix: 'none', outputGuard: false } });
  // @ts-expect-error
  createPi({ mcpSettings: { toolPrefix: 'bare' } });
});

test('createPi accepts project resources', () => {
  createPi({
    resources: {
      skills: [
        {
          name: 'brand-voice',
          description: 'Voice rules',
          filePath: '/sandbox/skills/brand-voice/SKILL.md',
        },
      ],
    },
  });
  // @ts-expect-error
  createPi({ resources: { skills: [{ name: 'brand-voice' }] } });
});
