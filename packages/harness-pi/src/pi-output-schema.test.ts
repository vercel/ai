import { HarnessCapabilityUnsupportedError } from '@ai-sdk/harness';
import { describe, expect, it } from 'vitest';
import { rejectOutputSchema } from './pi-session';

/*
 * Pi has no native output-schema enforcement and does not fall back to a
 * best-effort mode. The guard `doPromptTurn` / `doContinueTurn` run at the top
 * of every turn must reject an `outputSchema` with a clear capability error so
 * the caller fails fast rather than receiving an unvalidated object.
 */
describe('pi adapter — output schema capability', () => {
  it('throws HarnessCapabilityUnsupportedError when an outputSchema is requested', () => {
    expect(() =>
      rejectOutputSchema({ type: 'object', properties: {} }),
    ).toThrowError(HarnessCapabilityUnsupportedError);
  });

  it('reports the pi harness id on the error', () => {
    try {
      rejectOutputSchema({ type: 'object' });
      throw new Error('expected rejectOutputSchema to throw');
    } catch (error) {
      expect(HarnessCapabilityUnsupportedError.isInstance(error)).toBe(true);
      expect((error as HarnessCapabilityUnsupportedError).harnessId).toBe('pi');
    }
  });

  it('is a no-op when no schema is requested', () => {
    expect(() => rejectOutputSchema(undefined)).not.toThrow();
    expect(() => rejectOutputSchema(null)).not.toThrow();
  });
});
