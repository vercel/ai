import { JSONObject } from '@ai-sdk/provider';
import { AnthropicMessageMetadata } from './anthropic-message-metadata';

/**
 * Sets the Anthropic container ID in the provider options based on
 * the last step's provider metadata.
 *
 * You can use this function in `prepareStep` to forward the container ID between steps.
 */
export function forwardAnthropicContainerIdFromLastStep({
  steps,
}: {
  steps: Array<{
    providerMetadata?: Record<string, JSONObject>;
  }>;
}): undefined | { providerOptions?: Record<string, JSONObject> } {
  if (steps.length === 0) {
    return undefined;
  }

  const lastStep = steps[steps.length - 1];
  const containerId = (
    lastStep.providerMetadata?.anthropic as AnthropicMessageMetadata | undefined
  )?.container?.id;

  if (!containerId) {
    return undefined;
  }

  return {
    providerOptions: {
      anthropic: {
        container: { id: containerId },
      },
    },
  };
}
