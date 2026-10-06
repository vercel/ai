import { expectTypeOf, test } from 'vitest';
import {
  createPi,
  type PiCredentialStore,
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

test('createPi accepts MCP adapter settings', () => {
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
