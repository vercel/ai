import * as acp from '@agentclientprotocol/sdk';
import type { ACPModelMapping } from '../acp-v1-settings';

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
}): Promise<void> {
  if (model == null) return;
  if (mapping == null) {
    throw new Error('ACP model mapping is required when a model is set.');
  }
  /*
   * Some ACP harnesses, including Grok Build, use the non-standard
   * `session/set_model` convention.
   */
  if (mapping.type === 'session-model') {
    await agent.request('session/set_model', {
      sessionId,
      [mapping.path]: model,
    });
    return;
  }
  await agent.request(acp.methods.agent.session.setConfigOption, {
    sessionId,
    configId: mapping.path,
    value: model,
  });
}
