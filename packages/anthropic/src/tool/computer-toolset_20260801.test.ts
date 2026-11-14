import { safeValidateTypes } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import {
  computerToolset_20260801,
  computerToolset_20260801Members,
} from './computer-toolset_20260801';

describe('computerToolset_20260801', () => {
  it.each(computerToolset_20260801Members)(
    'should allow %s by default',
    async action => {
      const tool = computerToolset_20260801({});
      const result = await safeValidateTypes({
        value: { action },
        schema: tool.inputSchema,
      });
      expect(result.success).toBe(true);
    },
  );

  it('should reject disabled members in its local input schema', async () => {
    const tool = computerToolset_20260801({
      configs: { wait: { enabled: false } },
    });
    const result = await safeValidateTypes({
      value: { action: 'wait', duration: 0 },
      schema: tool.inputSchema,
    });
    expect(result.success).toBe(false);
  });

  it('should preserve enabled and deferred members', async () => {
    const tool = computerToolset_20260801({
      configs: {
        screenshot: { enabled: true },
        wait: { deferLoading: true },
      },
    });
    for (const action of ['screenshot', 'wait', 'cursor_position']) {
      const result = await safeValidateTypes({
        value: { action },
        schema: tool.inputSchema,
      });
      expect(result.success).toBe(true);
    }
  });

  it('should reject every member when all are disabled', async () => {
    const tool = computerToolset_20260801({
      configs: Object.fromEntries(
        computerToolset_20260801Members.map(member => [
          member,
          { enabled: false },
        ]),
      ),
    });
    for (const action of computerToolset_20260801Members) {
      const result = await safeValidateTypes({
        value: { action },
        schema: tool.inputSchema,
      });
      expect(result.success).toBe(false);
    }
  });
});
