import { JSONObject } from '@ai-sdk/provider';
import { AnthropicMessageMetadata } from './anthropic-message-metadata';

/**
 * Container information from a previous step.
 */
export interface AnthropicContainerReuseDetails {
  /**
   * Identifier for the container.
   */
  id: string;

  /**
   * The time at which the container will expire (RFC3339 timestamp).
   */
  expiresAt: string;
}

/**
 * Extracts details relevant for reusing anthropic's containerized environment.
 *
 * Searches backwards through steps to find details about most recently
 * used container environment.
 *
 * @returns The container id and expiresAt if found, undefined otherwise.
 */
export function extractAnthropicContainerReuseDetails({
  steps,
}: {
  steps: Array<{
    providerMetadata?: Record<string, JSONObject>;
  }>;
}): AnthropicContainerReuseDetails | undefined {
  // Search backwards through steps to find the most recent container
  for (let i = steps.length - 1; i >= 0; i--) {
    const container = (
      steps[i].providerMetadata?.anthropic as unknown as
        | AnthropicMessageMetadata
        | undefined
    )?.container;

    if (container) {
      return {
        id: container.id,
        expiresAt: container.expiresAt,
      };
    }
  }

  return undefined;
}

/**
 * Sets the Anthropic container ID in the provider options based on
 * any previous step's provider metadata.
 *
 * Searches backwards through steps to find the most recent container ID.
 * You can use this function in `prepareStep` to forward the container ID between steps.
 */
export function forwardAnthropicContainerIdFromLastStep({
  steps,
}: {
  steps: Array<{
    providerMetadata?: Record<string, JSONObject>;
  }>;
}): undefined | { providerOptions?: Record<string, JSONObject> } {
  // Search backwards through steps to find the most recent container ID
  for (let i = steps.length - 1; i >= 0; i--) {
    const containerId = (
      steps[i].providerMetadata?.anthropic as unknown as
        | AnthropicMessageMetadata
        | undefined
    )?.container?.id;

    if (containerId) {
      return {
        providerOptions: {
          anthropic: {
            container: { id: containerId },
          },
        },
      };
    }
  }

  return undefined;
}
