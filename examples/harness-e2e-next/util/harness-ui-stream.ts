import { getHarnessErrorMessage } from '@ai-sdk/harness/agent';
import { getErrorMessage } from '@ai-sdk/provider-utils';

const genericHarnessErrorMessage = getHarnessErrorMessage(undefined);

export function getHarnessE2EErrorMessage(error: unknown): string {
  console.error(error);

  const safeMessage = getHarnessErrorMessage(error);
  if (safeMessage !== genericHarnessErrorMessage) {
    return safeMessage;
  }

  const transparentMessage =
    error instanceof Error ? error.message : getErrorMessage(error);
  return transparentMessage || genericHarnessErrorMessage;
}
