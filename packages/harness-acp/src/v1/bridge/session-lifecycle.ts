import { HarnessBridgeCapabilityUnsupportedError } from '@ai-sdk/harness/bridge';
import * as acp from '@agentclientprotocol/sdk';
import type { ACPInitializeResult } from './protocol-configuration';

export type ACPSessionRestorationMethod = 'resume' | 'load';

export function resolveACPSessionRestorationMethod({
  initialization,
  harnessId,
}: {
  initialization: ACPInitializeResult;
  harnessId: string;
}): ACPSessionRestorationMethod {
  const sessionCapabilities = initialization.agentCapabilities
    ?.sessionCapabilities as Readonly<Record<string, unknown>> | undefined;
  if (
    sessionCapabilities?.resume != null &&
    sessionCapabilities.resume !== false
  ) {
    return 'resume';
  }
  if (initialization.agentCapabilities?.loadSession === true) {
    return 'load';
  }
  throw new HarnessBridgeCapabilityUnsupportedError({
    harnessId,
    message:
      'Cold ACP session restoration requires the agent to advertise sessionCapabilities.resume or loadSession; a fresh unrelated ACP session will not be created.',
  });
}

export async function restoreACPBridgeSession({
  agent,
  initialization,
  sessionId,
  cwd,
  mcpServers,
  meta,
  harnessId,
  setHistoricalUpdatesSuppressed,
  discardCapturedHistory,
}: {
  agent: acp.ClientContext;
  initialization: ACPInitializeResult;
  sessionId: string;
  cwd: string;
  mcpServers: ReadonlyArray<acp.McpServer>;
  meta: Readonly<Record<string, unknown>> | undefined;
  harnessId: string;
  setHistoricalUpdatesSuppressed(options: { suppressed: boolean }): void;
  discardCapturedHistory(): void;
}): Promise<{
  method: ACPSessionRestorationMethod;
  response: acp.ResumeSessionResponse | acp.LoadSessionResponse;
}> {
  const method = resolveACPSessionRestorationMethod({
    initialization,
    harnessId,
  });
  setHistoricalUpdatesSuppressed({ suppressed: true });
  try {
    const request = {
      sessionId,
      cwd,
      mcpServers: [...mcpServers],
      ...(meta == null ? {} : { _meta: meta }),
    };
    const response =
      method === 'resume'
        ? await agent.request<
            acp.ResumeSessionResponse,
            acp.ResumeSessionRequest
          >(acp.methods.agent.session.resume, request)
        : await agent.request<acp.LoadSessionResponse, acp.LoadSessionRequest>(
            acp.methods.agent.session.load,
            request,
          );
    discardCapturedHistory();
    return { method, response };
  } finally {
    setHistoricalUpdatesSuppressed({ suppressed: false });
  }
}
