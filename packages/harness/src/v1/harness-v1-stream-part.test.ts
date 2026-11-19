import { describe, expect, it } from 'vitest';
import { harnessV1StreamPartSchema } from './harness-v1-stream-part';

describe('harnessV1StreamPartSchema', () => {
  it.each(['finish-step', 'finish'] as const)(
    'accepts an interrupted %s',
    type => {
      const part = {
        type,
        finishReason: { unified: 'interrupted', raw: undefined },
        [type === 'finish' ? 'totalUsage' : 'usage']: {
          inputTokens: {},
          outputTokens: {},
        },
      };

      expect(harnessV1StreamPartSchema.parse(part)).toEqual(part);
    },
  );
});
