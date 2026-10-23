import * as acp from '@agentclientprotocol/sdk';
import type { ACPModelMapping } from '../acp-v1-settings';
import { resolveACPModelId } from './resolve-acp-model-id';

/**
 * Applies the requested model to the ACP session and returns the model the
 * agent reports as selected afterwards, falling back to the requested model
 * when the agent's response does not report one. Returns `undefined` when no
 * model is requested.
 */
export async function configureACPModel({
  agent,
  sessionId,
  model,
  mapping,
}: {
  agent: acp.ClientContext;
  sessionId: string;
  model: string | undefined;
  mapping: ACPModelMapping | undefined;
}): Promise<string | undefined> {
  if (model == null) return undefined;
  if (mapping == null) {
    throw new Error('ACP model mapping is required when a model is set.');
  }
  /*
   * Some ACP harnesses, including Grok Build, use the non-standard
   * `session/set_model` convention.
   */
  if (mapping.type === 'session-model') {
    const response = await agent.request('session/set_model', {
      sessionId,
      [mapping.path]: model,
    });
    return (
      resolveACPModelId({ sessionState: response, modelMapping: mapping }) ??
      model
    );
  }
  const response = await agent.request(
    acp.methods.agent.session.setConfigOption,
    {
      sessionId,
      configId: mapping.path,
      value: model,
    },
  );
  return (
    resolveACPModelId({ sessionState: response, modelMapping: mapping }) ??
    model
  );
}
