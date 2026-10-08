import type { ExtensionFactory } from '@earendil-works/pi-coding-agent';
import { expectTypeOf, test } from 'vitest';
import {
  createPi,
  type PiCredentialStore,
  type PiHarnessExtensionSession,
  type PiHarnessSettings,
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
  createPi({ fileToolPathPolicy: { readableRoots, deniedRoots } });
  createPi({ fileToolPathPolicy: {} });
});

test('createPi accepts native MCP server configs', () => {
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
    },
  });
  createPi({
    // @ts-expect-error
    mcpServers: { brand: { url: 'https://x', exposure: 'codemode' } },
  });
  createPi({
    // @ts-expect-error
    mcpServers: { memory: { command: 'memory-mcp', lifecycle: 'eager' } },
  });
});

test('createPi accepts deprecated MCP adapter settings', () => {
  createPi({ mcpSettings: { toolPrefix: 'none', outputGuard: false } });
  // @ts-expect-error
  createPi({ mcpSettings: { toolPrefix: 'bare' } });
});

test('createPi accepts a file tool path policy with readonly roots', () => {
  const readableRoots = ['/home/vercel-sandbox', '/tmp'] as const;
  const deniedRoots = ['/home/vercel-sandbox/.credentials'] as const;
  createPi({ fileToolPathPolicy: { readableRoots, deniedRoots } });
  createPi({ fileToolPathPolicy: {} });
});

test('createPi accepts project resources', () => {
  createPi({
    resources: {
      contextFiles: [{ path: '/sandbox/work/AGENTS.md', content: 'Notes' }],
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
