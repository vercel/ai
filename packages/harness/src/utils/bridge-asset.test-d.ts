import { expectTypeOf, test } from 'vitest';
import { createReadBridgeAsset } from './bridge-asset';

test('restricts reads to configured asset names', () => {
  const readBridgeAsset = createReadBridgeAsset({
    'first.txt': new URL('file:///first.txt'),
    'second.txt': new URL('file:///second.txt'),
  });

  expectTypeOf(readBridgeAsset)
    .parameter(0)
    .toEqualTypeOf<'first.txt' | 'second.txt'>();
});
