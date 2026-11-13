import type { StreamFn } from '@earendil-works/pi-agent-core';
import {
  createModels,
  type Api,
  type Model,
  type MutableModels,
} from '@earendil-works/pi-ai';
import { vercelAIGatewayProvider } from '@earendil-works/pi-ai/providers/vercel-ai-gateway';
import { getAiGatewayAuthFromEnv } from '@ai-sdk/harness/utils';
import { VERSION } from './version';

/**
 * Value sent in the `User-Agent` and `x-client-app` headers of model requests.
 */
export const PI_CLIENT_APP = `ai-sdk-harness-pi-v2/${VERSION}`;

/**
 * Model used for a turn whose settings do not request one.
 */
export const DEFAULT_PI_MODEL_ID = 'anthropic/claude-sonnet-4.6';

/**
 * Pi model access for one drive: model lookup plus the stream function that
 * sends a model request with the drive's credentials.
 */
export type PiModelRuntime = {
  /**
   * Resolves a model ID to Pi's model definition. Throws when Pi's catalog
   * does not know the model.
   */
  resolveModel(options: {
    /**
     * Model ID, e.g. `anthropic/claude-sonnet-4.6`.
     */
    modelId: string;
  }): Model<Api>;

  /**
   * Stream function used by Pi's agent loop for every model request.
   */
  streamFn: StreamFn;
};

let gatewayModels: MutableModels | undefined;

/**
 * Returns the process-wide Pi model collection with the AI Gateway provider,
 * created on first use. The collection holds only the provider's static model
 * catalog, so sharing it across drives and harness instances is safe.
 */
function getGatewayModels(): MutableModels {
  if (gatewayModels == null) {
    gatewayModels = createModels();
    gatewayModels.setProvider(vercelAIGatewayProvider());
  }
  return gatewayModels;
}

/**
 * Creates the model runtime for one drive.
 *
 * The AI Gateway credential (`AI_GATEWAY_API_KEY`, else `VERCEL_OIDC_TOKEN`)
 * is read from the environment once per drive, so a refreshed OIDC token is
 * picked up by the next drive. Throws when no credential is available, before
 * the drive does any work. Every model resolves under Pi's
 * `vercel-ai-gateway` provider, with the base URL from the environment.
 */
export function createPiModelRuntime(): PiModelRuntime {
  /*
   * TODO: Only AI Gateway authentication is supported so far. Support the
   * authentication of other providers (e.g. OpenAI or Anthropic API keys)
   * once the harness offers a way to configure it.
   */
  const { apiKey, baseUrl } = getAiGatewayAuthFromEnv({ env: process.env });
  if (apiKey == null) {
    throw new Error(
      'Pi harness: no AI Gateway credential found. Set AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN.',
    );
  }
  const models = getGatewayModels();

  return {
    resolveModel({ modelId }) {
      const model = models.getModel('vercel-ai-gateway', modelId);
      if (model == null) {
        throw new Error(
          `Pi harness: the model '${modelId}' is not available through AI Gateway.`,
        );
      }
      return { ...model, baseUrl };
    },
    streamFn: (model, context, options) =>
      models.streamSimple(model, context, {
        ...options,
        apiKey,
        headers: {
          ...options?.headers,
          'User-Agent': PI_CLIENT_APP,
          'x-client-app': PI_CLIENT_APP,
        },
      }),
  };
}
