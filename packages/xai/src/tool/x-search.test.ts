import { safeValidateTypes } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { xSearch, xSearchArgsSchema } from './x-search';

const handles = (count: number) =>
  Array.from({ length: count }, (_, i) => `handle${i}`);

describe('xSearchArgsSchema', () => {
  it.each(['allowedXHandles', 'excludedXHandles'])(
    'accepts 20 %s',
    async field => {
      const result = await safeValidateTypes({
        value: { [field]: handles(20) },
        schema: xSearchArgsSchema,
      });

      expect(result.success).toBe(true);
    },
  );

  it.each(['allowedXHandles', 'excludedXHandles'])(
    'rejects 21 %s',
    async field => {
      const result = await safeValidateTypes({
        value: { [field]: handles(21) },
        schema: xSearchArgsSchema,
      });

      expect(result.success).toBe(false);
    },
  );
});

describe('xSearch', () => {
  it('keeps the search arguments in the tool call input', async () => {
    const input = {
      query: 'from:xai filter:media',
      limit: 20,
      mode: 'Latest',
    };

    const result = await safeValidateTypes({
      value: input,
      schema: xSearch().inputSchema,
    });

    expect(result).toMatchObject({ success: true, value: input });
  });
});
