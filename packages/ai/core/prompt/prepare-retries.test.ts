import { expect, it } from 'vitest';
import { prepareRetries } from './prepare-retries';

it('should set default values correctly when no input is provided', () => {
  const defaultResult = prepareRetries({ maxRetries: undefined });
  expect(defaultResult.maxRetries).toBe(2);
});
