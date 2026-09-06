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

test('PiHarnessSettings accepts filesystem extension discovery', () => {
  const settings = {
    extensions: true,
  } as const satisfies PiHarnessSettings;

  expectTypeOf(settings.extensions).toEqualTypeOf<true>();
  createPi(settings);
});

test('createPi accepts the max thinking level', () => {
  createPi({ thinkingLevel: 'max' });
});
