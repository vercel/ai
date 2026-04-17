import { describe, it } from 'vitest';
import type { GatewayProviderOptions } from './index';

describe('GatewayProviderOptions', () => {
  it('should accept caching: auto', () => {
    const options = {
      caching: 'auto',
    } satisfies GatewayProviderOptions;

    options;
  });

  it('should make caching optional', () => {
    const options = {} satisfies GatewayProviderOptions;

    options;
  });

  it('should reject unknown caching values', () => {
    const options = {
      // @ts-expect-error 'manual' is not a valid caching value
      caching: 'manual',
    } satisfies GatewayProviderOptions;

    options;
  });
});
