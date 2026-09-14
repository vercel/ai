import { expectTypeOf, test } from 'vitest';
import { createPi, type PiHarnessSettings } from './index';

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
