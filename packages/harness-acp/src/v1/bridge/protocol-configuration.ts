import type { ACPResolvedProviderAuthentication } from './acp-v1-bridge-environment';
import type { ACPClientApp } from '../../acp-auth';
import type { ACPAuthentication } from '../acp-v1-settings';
import {
  resolveACPProfileValue,
  type ACPGatewayValues,
} from './profile-values';

export type ACPInitializeResult = {
  readonly protocolVersion: number;
  readonly authMethods?: ReadonlyArray<{ readonly id: string }> | null;
  readonly agentCapabilities?: Readonly<Record<string, unknown>> | null;
};

export function createACPInitializeRequest({
  protocolVersion,
  clientApp,
  authentication,
  clientCapabilities: configuredClientCapabilities,
  supportsBooleanSessionConfigOptions = false,
}: {
  protocolVersion: number;
  clientApp: ACPClientApp;
  authentication: ACPAuthentication | undefined;
  clientCapabilities?: Readonly<Record<string, unknown>>;
  supportsBooleanSessionConfigOptions?: boolean;
}): {
  readonly protocolVersion: number;
  readonly clientInfo: {
    readonly name: string;
    readonly version: string;
  };
  readonly clientCapabilities: Readonly<Record<string, unknown>>;
} {
  let clientCapabilities = mergeRecords({
    left: authentication?.clientCapabilities ?? {},
    right: configuredClientCapabilities ?? {},
  });
  if (supportsBooleanSessionConfigOptions) {
    clientCapabilities = mergeRecords({
      left: clientCapabilities,
      right: {
        session: {
          configOptions: {
            boolean: {},
          },
        },
      },
    });
  }
  return {
    protocolVersion,
    clientInfo: clientApp,
    clientCapabilities,
  };
}

export function resolveACPLaunchEnvironment({
  providerAuthentication,
  gateway,
}: {
  providerAuthentication: ACPResolvedProviderAuthentication | undefined;
  gateway: ACPGatewayValues | undefined;
}): Record<string, string> {
  if (providerAuthentication?.type !== 'ai-gateway') {
    return {};
  }
  const resolved = asRecord(
    resolveACPProfileValue({
      value: providerAuthentication.env,
      gateway: requireGateway({ gateway }),
    }),
  );
  return Object.fromEntries(
    Object.entries(resolved).map(([key, value]) => [
      key,
      typeof value === 'string' ? value : JSON.stringify(value),
    ]),
  );
}

export function validateACPProtocolVersion({
  requested,
  initialization,
}: {
  requested: number;
  initialization: ACPInitializeResult;
}): void {
  if (initialization.protocolVersion !== requested) {
    throw new Error(
      `ACP protocol negotiation failed: requested v${requested}, agent selected v${initialization.protocolVersion}.`,
    );
  }
}

export function assertACPAuthenticationMethod({
  initialization,
  methodId,
}: {
  initialization: ACPInitializeResult;
  methodId: string;
}): void {
  if (!initialization.authMethods?.some(method => method.id === methodId)) {
    const advertised =
      initialization.authMethods?.map(method => method.id).join(', ') || 'none';
    throw new Error(
      `ACP authentication method ${JSON.stringify(methodId)} is not advertised by the agent. Advertised methods: ${advertised}.`,
    );
  }
}

function mergeRecords({
  left,
  right,
}: {
  left: Readonly<Record<string, unknown>>;
  right: Readonly<Record<string, unknown>>;
}): Readonly<Record<string, unknown>> {
  const result: Record<string, unknown> = { ...left };
  for (const [key, value] of Object.entries(right)) {
    const previous = result[key];
    result[key] =
      isRecord(previous) && isRecord(value)
        ? mergeRecords({ left: previous, right: value })
        : value;
  }
  return result;
}

function requireGateway({
  gateway,
}: {
  gateway: ACPGatewayValues | undefined;
}): ACPGatewayValues {
  if (gateway == null) {
    throw new Error('ACP Gateway profile values are unavailable.');
  }
  return gateway;
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) {
    throw new Error('ACP profile data must resolve to an object.');
  }
  return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
