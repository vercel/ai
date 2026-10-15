import { describe, expect, it } from 'vitest';
import { normalizeOpaDecision } from './normalize-opa-decision';

describe('normalizeOpaDecision', () => {
  describe('explicit decision form', () => {
    it('maps "allow" to approved', () => {
      expect(normalizeOpaDecision({ decision: 'allow' })).toEqual({
        type: 'approved',
      });
    });

    it('carries reason through on allow', () => {
      expect(
        normalizeOpaDecision({ decision: 'allow', reason: 'role match' }),
      ).toEqual({ type: 'approved', reason: 'role match' });
    });

    it('maps "deny" to denied with reason', () => {
      expect(
        normalizeOpaDecision({
          decision: 'deny',
          reason: 'pushes require approval',
        }),
      ).toEqual({ type: 'denied', reason: 'pushes require approval' });
    });

    it('maps "requires-approval" to user-approval', () => {
      expect(normalizeOpaDecision({ decision: 'requires-approval' })).toEqual({
        type: 'user-approval',
      });
    });

    it('carries reason through on requires-approval', () => {
      expect(
        normalizeOpaDecision({
          decision: 'requires-approval',
          reason: 'requires operator review',
        }),
      ).toEqual({
        type: 'user-approval',
        reason: 'requires operator review',
      });
    });

    it('maps "not-applicable" to not-applicable', () => {
      expect(normalizeOpaDecision({ decision: 'not-applicable' })).toEqual({
        type: 'not-applicable',
      });
    });
  });

  describe('legacy boolean form', () => {
    it('maps { allow: true } to approved', () => {
      expect(normalizeOpaDecision({ allow: true })).toEqual({
        type: 'approved',
      });
    });

    it('maps { allow: false, reason } to denied with reason', () => {
      expect(
        normalizeOpaDecision({ allow: false, reason: 'no rule matched' }),
      ).toEqual({ type: 'denied', reason: 'no rule matched' });
    });

    it('maps { allow: true, reason } to approved with reason', () => {
      expect(
        normalizeOpaDecision({ allow: true, reason: 'reviewer role' }),
      ).toEqual({ type: 'approved', reason: 'reviewer role' });
    });
  });

  describe('fallthrough', () => {
    it('treats null as not-applicable', () => {
      expect(normalizeOpaDecision(null)).toEqual({ type: 'not-applicable' });
    });

    it('treats undefined as not-applicable', () => {
      expect(normalizeOpaDecision(undefined)).toEqual({
        type: 'not-applicable',
      });
    });

    it.each([
      ['an unknown decision value', { decision: 'blocked' }],
      ['a non-boolean legacy value', { allow: 'false' }],
      ['an unknown key', { verdict: 'deny' }],
      ['an unexpected nested shape', { result: { decision: 'deny' } }],
      ['a primitive', 'yes'],
    ])('denies %s', (_description, result) => {
      expect(normalizeOpaDecision(result)).toEqual({
        type: 'denied',
        reason: 'unrecognized OPA policy decision',
      });
    });
  });
});
