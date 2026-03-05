import { describe, expect, it } from 'vitest';
import { cambaiFailedResponseHandler } from './cambai-error';

describe('cambaiFailedResponseHandler', () => {
  it('should be defined', () => {
    expect(cambaiFailedResponseHandler).toBeDefined();
  });
});
