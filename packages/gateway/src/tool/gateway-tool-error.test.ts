import { asSchema, safeValidateTypes } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { gatewayTools } from '../gateway-tools';

describe('Gateway tool errors', () => {
  it.each([
    'deepseekFetch',
    'deepseekSearch',
    'parallelSearch',
    'takoSearch',
  ] as const)(
    '%s preserves structured errors and additive fields',
    async name => {
      const value = {
        error: 'gateway_rate_limit',
        message: 'Retry later',
        statusCode: 429,
        retryAfter: '60',
        statusText: 'Too Many Requests',
        future_field: true,
      };
      const result = await safeValidateTypes({
        value,
        schema: asSchema<unknown>(gatewayTools[name]().outputSchema),
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.value).toEqual(value);
    },
  );
});
