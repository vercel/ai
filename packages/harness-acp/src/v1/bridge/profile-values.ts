import type { ACPProfileValue, ACPSerializableValue } from '../acp-v1-settings';

export type ACPGatewayValues = {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly clientAppName: string;
  readonly clientAppVersion: string;
};

export function resolveACPProfileValue({
  value,
  gateway,
}: {
  value: ACPProfileValue;
  gateway: ACPGatewayValues;
}): ACPSerializableValue {
  if (Array.isArray(value)) {
    return value.map(item => resolveACPProfileValue({ value: item, gateway }));
  }
  if (value !== null && typeof value === 'object') {
    if (isValueSource(value)) {
      const sourceValue = resolveSource({ source: value.$source, gateway });
      const resolved = `${value.prefix ?? ''}${sourceValue}`;
      return value.ensureSuffix == null
        ? `${resolved}${value.suffix ?? ''}`
        : ensureSuffix({
            value: resolved,
            suffix: value.ensureSuffix,
          });
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        resolveACPProfileValue({ value: item, gateway }),
      ]),
    );
  }
  return value;
}

function isValueSource(value: object): value is {
  readonly $source:
    | 'gateway-api-key'
    | 'gateway-base-url'
    | 'gateway-authorization'
    | 'client-app'
    | 'client-app-name'
    | 'client-app-version';
  readonly prefix?: string;
  readonly suffix?: string;
  readonly ensureSuffix?: string;
} {
  return (
    '$source' in value &&
    typeof (value as { $source?: unknown }).$source === 'string'
  );
}

function ensureSuffix({
  value,
  suffix,
}: {
  value: string;
  suffix: string;
}): string {
  const normalized = value.replace(/\/+$/, '');
  return normalized.endsWith(suffix) ? normalized : `${normalized}${suffix}`;
}

function resolveSource({
  source,
  gateway,
}: {
  source:
    | 'gateway-api-key'
    | 'gateway-base-url'
    | 'gateway-authorization'
    | 'client-app'
    | 'client-app-name'
    | 'client-app-version';
  gateway: ACPGatewayValues;
}): string {
  switch (source) {
    case 'gateway-api-key':
      return gateway.apiKey;
    case 'gateway-base-url':
      return gateway.baseUrl;
    case 'gateway-authorization':
      return `Bearer ${gateway.apiKey}`;
    case 'client-app':
      return `${gateway.clientAppName}/${gateway.clientAppVersion}`;
    case 'client-app-name':
      return gateway.clientAppName;
    case 'client-app-version':
      return gateway.clientAppVersion;
  }
}
