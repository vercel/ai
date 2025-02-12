import { describe, beforeEach } from 'vitest';
import type { Capability, ModelCapabilities } from './types/capability';

const shouldRunTests = (
  capabilities: ModelCapabilities | undefined,
  requiredCapabilities: Capability[],
) => {
  return capabilities
    ? requiredCapabilities.every(cap => capabilities.includes(cap))
    : false;
};

export function describeIfCapability(
  capabilities: ModelCapabilities,
  requiredCapabilities: ModelCapabilities,
  description: string,
  fn: () => void,
) {
  if (shouldRunTests(capabilities, requiredCapabilities)) {
    describe(description, () => {
      beforeEach(context => {
        if (context.task.meta) {
          context.task.meta.capability = requiredCapabilities[0];
        }
      });

      fn();
    });
  }
}
