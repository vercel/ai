import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { modelMessageSchema } from './message';

describe('cross-realm message validation', () => {
  it.each(['new Uint8Array([1, 2, 3])', 'new ArrayBuffer(3)'])(
    'accepts tagged foreign file data: %s',
    expression => {
      const data: Uint8Array | ArrayBuffer = vm.runInNewContext(expression);
      const message = {
        role: 'user',
        content: [
          {
            type: 'file',
            mediaType: 'application/octet-stream',
            data: { type: 'data', data },
          },
        ],
      };
      expect(modelMessageSchema.safeParse(message).success).toBe(true);
    },
  );
});
