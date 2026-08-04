import type { ACPResolvedProviderAuthentication } from './acp-v1-bridge-environment';
import type { ACPAuthentication } from './acp-v1-settings';
import {
  resolveACPProfileValue,
  type ACPGatewayValues,
} from './profile-values';
import { VERSION } from '../version';

export type ACPInitializeResult = {
  readonly protocolVersion: number;
  readonly authMethods?: ReadonlyArray<{ readonly id: string }> | null;
  readonly agentCapabilities?: Readonly<Record<string, unknown>> | null;
};

export function createACPInitializeRequest({
  protocolVersion,
  authentication,
  providerAuthentication,
  gateway,
  supportsBooleanSessionConfigOptions = false,
}: {
  protocolVersion: number;
  authentication: ACPAuthentication | undefined;
  providerAuthentication: ACPResolvedProviderAuthentication | undefined;
  gateway: ACPGatewayValues | undefined;
  supportsBooleanSessionConfigOptions?: boolean;
}): {
  readonly protocolVersion: number;
  readonly clientInfo: {
    readonly name: string;
    readonly version: string;
  };
  readonly clientCapabilities: Readonly<Record<string, unknown>>;
} {
  let clientCapabilities: Readonly<Record<string, unknown>> =
    authentication?.clientCapabilities ?? {};
  if (
    providerAuthentication?.type === 'ai-gateway' &&
    'clientCapabilities' in providerAuthentication.route &&
    providerAuthentication.route.clientCapabilities != null
  ) {
    clientCapabilities = mergeRecords({
      left: clientCapabilities,
      right: asRecord(
        resolveACPProfileValue({
          value: providerAuthentication.route.clientCapabilities,
          gateway: requireGateway({ gateway }),
        }),
      ),
    });
  }
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
    clientInfo: {
      name: '@ai-sdk/harness-acp',
      version: VERSION,
    },
    clientCapabilities,
  };
}

export function resolveACPAuthentication({
  authentication,
  providerAuthentication,
}: {
  authentication: ACPAuthentication | undefined;
  providerAuthentication: ACPResolvedProviderAuthentication | undefined;
}): ACPAuthentication | undefined {
  return providerAuthentication?.type === 'ai-gateway' &&
    providerAuthentication.route.type === 'auth-method'
    ? undefined
    : authentication;
}

export function resolveACPLaunchEnvironment({
  providerAuthentication,
  gateway,
}: {
  providerAuthentication: ACPResolvedProviderAuthentication | undefined;
  gateway: ACPGatewayValues | undefined;
}): Record<string, string> {
  if (
    providerAuthentication?.type !== 'ai-gateway' ||
    !('env' in providerAuthentication.route) ||
    providerAuthentication.route.env == null
  ) {
    return {};
  }
  const resolved = asRecord(
    resolveACPProfileValue({
      value: providerAuthentication.route.env,
      gateway: requireGateway({ gateway }),
    }),
  );
  return Object.fromEntries(
    Object.entries(resolved).map(([key, value]) => {
      if (typeof value !== 'string') {
        throw new Error(
          `ACP Gateway launch environment value for ${key} must resolve to a string.`,
        );
      }
      return [key, value];
    }),
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

export function assertACPAgentCapability({
  capabilities,
  path,
}: {
  capabilities: Readonly<Record<string, unknown>> | null | undefined;
  path: ReadonlyArray<string>;
}): void {
  if (path.length === 0) {
    throw new Error(
      'ACP provider method routing requires a non-empty advertised capability path.',
    );
  }
  let current: unknown = capabilities;
  for (const segment of path) {
    if (current == null || typeof current !== 'object') {
      throw new Error(
        `ACP provider method requires unadvertised agent capability ${path.join('.')}.`,
      );
    }
    current = (current as Record<string, unknown>)[segment];
  }
  if (current == null || current === false) {
    throw new Error(
      `ACP provider method requires unadvertised agent capability ${path.join('.')}.`,
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
