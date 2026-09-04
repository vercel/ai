import type { InitializeResponse } from '@agentclientprotocol/sdk';

export function createACPInitializationDiagnostic({
  initialization,
  sessionId,
}: {
  initialization: InitializeResponse;
  sessionId: string;
}): Record<string, unknown> {
  const agentInfo = initialization.agentInfo;
  return {
    protocolVersion: initialization.protocolVersion,
    sessionId,
    agent:
      agentInfo == null
        ? null
        : {
            name: agentInfo.name,
            version: agentInfo.version,
            ...(agentInfo.title == null ? {} : { title: agentInfo.title }),
          },
    capabilities: stripMetadata({
      value: initialization.agentCapabilities ?? {},
    }),
    authMethods: (initialization.authMethods ?? []).map(method => ({
      id: method.id,
      type: 'type' in method ? method.type : 'agent',
    })),
  };
}

export function createACPBridgeError({
  stage,
  cause,
}: {
  stage:
    | 'session initialization'
    | 'session cancellation'
    | 'prompt update stream';
  cause: unknown;
}): Error {
  const causeMessage = getErrorMessage({ error: cause });
  const error = new Error(
    causeMessage == null
      ? `ACP ${stage} failed.`
      : `ACP ${stage} failed: ${causeMessage}`,
  );
  (error as Error & { cause?: unknown }).cause = cause;
  return error;
}

function getErrorMessage({ error }: { error: unknown }): string | undefined {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    error != null &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return undefined;
}

function stripMetadata({ value }: { value: unknown }): unknown {
  if (Array.isArray(value)) {
    return value.map(item => stripMetadata({ value: item }));
  }
  if (value == null || typeof value !== 'object') return value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key !== '_meta') result[key] = stripMetadata({ value: item });
  }
  return result;
}
