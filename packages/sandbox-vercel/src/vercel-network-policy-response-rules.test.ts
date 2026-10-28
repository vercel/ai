import { readFileSync } from 'node:fs';
import { HarnessCapabilityUnsupportedError } from '@ai-sdk/harness';
import type { NetworkPolicy, Sandbox } from '@vercel/sandbox';
import { describe, expect, it } from 'vitest';
import { VercelNetworkPolicyManager } from './vercel-network-policy-manager';

const fixture = JSON.parse(
  readFileSync(
    new URL('./__fixtures__/issue-24035.json', import.meta.url),
    'utf8',
  ),
) as { requestedPolicy: NetworkPolicy };

describe('issue #24035: response rules accepted by the live provider', () => {
  it.each(['addRequestTransformations', 'setRequestTransformations'] as const)(
    '%s must preserve response rules or reject the mutation',
    async operation => {
      // Isolate the AI SDK's own loss from the native SDK's separate readback
      // omission. This policy is the recorded, successfully enforced live input.
      let policy: NetworkPolicy = structuredClone(fixture.requestedPolicy);
      const sandbox = {
        currentSession: () => ({ networkPolicy: policy }),
        update: async (input: { networkPolicy: NetworkPolicy }) => {
          policy = input.networkPolicy;
        },
      } as unknown as Sandbox;
      const manager = new VercelNetworkPolicyManager({ sandbox });
      try {
        await manager[operation]([
          {
            match: { host: 'example.com' },
            transform: { headers: { 'x-example': '1' } },
          },
        ]);
      } catch (error) {
        if (!HarnessCapabilityUnsupportedError.isInstance(error)) {
          throw error;
        }
      }
      // No exact overall rule sequence is required. Rejection without mutation
      // is acceptable, as is retaining the restriction while adding headers.
      const rules =
        typeof policy === 'object' && !Array.isArray(policy.allow)
          ? policy.allow?.['registry.npmjs.org']
          : undefined;
      expect(
        ['PUT', 'POST', 'DELETE'].every(method =>
          rules?.some(
            rule =>
              rule.response?.statusCode === 403 &&
              (rule.match?.method == null ||
                rule.match.method.includes(method)),
          ),
        ),
        'ISSUE-24035: response restriction was silently removed',
      ).toBe(true);
    },
  );
});
