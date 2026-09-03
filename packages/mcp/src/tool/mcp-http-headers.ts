import { convertUint8ArrayToBase64, isRecord } from '@ai-sdk/provider-utils';

type HeaderValueType = 'boolean' | 'integer' | 'string';

export type MCPToolHeaderBinding = {
  headerName: string;
  path: string[];
  valueType: HeaderValueType;
};

export type MCPToolHeaderBindingsResult =
  | { success: true; bindings: MCPToolHeaderBinding[] }
  | { success: false; error: string };

const HTTP_TOKEN_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const BASE64_SENTINEL_PATTERN = /^=\?base64\?.*\?=$/;

export function encodeMCPHeaderValue(value: string): string {
  const isPlainAscii = [...value].every(character => {
    const code = character.charCodeAt(0);
    return code === 0x09 || (code >= 0x20 && code <= 0x7e);
  });

  if (
    isPlainAscii &&
    value.trim() === value &&
    !BASE64_SENTINEL_PATTERN.test(value)
  ) {
    return value;
  }

  return `=?base64?${convertUint8ArrayToBase64(new TextEncoder().encode(value))}?=`;
}

export function getMCPToolHeaderBindings(
  inputSchema: unknown,
): MCPToolHeaderBindingsResult {
  if (!isRecord(inputSchema)) {
    return {
      success: false,
      error: 'inputSchema must be a JSON Schema object',
    };
  }

  const bindings: MCPToolHeaderBinding[] = [];
  const headerNames = new Set<string>();
  let error: string | undefined;

  const visit = (
    value: unknown,
    path: string[],
    staticallyReachable: boolean,
  ): void => {
    if (error != null || !isRecord(value)) {
      return;
    }

    if ('x-mcp-header' in value) {
      if (!staticallyReachable || path.length === 0) {
        error = 'x-mcp-header is not on a statically reachable property';
        return;
      }

      const headerName = value['x-mcp-header'];
      if (
        typeof headerName !== 'string' ||
        !HTTP_TOKEN_PATTERN.test(headerName)
      ) {
        error = 'x-mcp-header must be a non-empty HTTP token';
        return;
      }

      const normalizedHeaderName = headerName.toLowerCase();
      if (headerNames.has(normalizedHeaderName)) {
        error = `x-mcp-header value "${headerName}" is not unique`;
        return;
      }

      const valueType = value.type;
      if (
        valueType !== 'boolean' &&
        valueType !== 'integer' &&
        valueType !== 'string'
      ) {
        error =
          'x-mcp-header can only annotate boolean, integer, or string properties';
        return;
      }

      headerNames.add(normalizedHeaderName);
      bindings.push({ headerName, path, valueType });
    }

    for (const [key, child] of Object.entries(value)) {
      if (key === 'x-mcp-header') {
        continue;
      }

      if (key === 'properties' && isRecord(child)) {
        for (const [propertyName, propertySchema] of Object.entries(child)) {
          visit(propertySchema, [...path, propertyName], staticallyReachable);
        }
      } else {
        visit(child, path, false);
      }
    }
  };

  visit(inputSchema, [], true);

  return error == null
    ? { success: true, bindings }
    : { success: false, error };
}

function getValueAtPath(
  value: Record<string, unknown>,
  path: string[],
): unknown {
  let current: unknown = value;
  for (const segment of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

export function createMCPToolHeaders({
  bindings,
  args,
}: {
  bindings: MCPToolHeaderBinding[];
  args: Record<string, unknown>;
}): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const binding of bindings) {
    const value = getValueAtPath(args, binding.path);
    if (value == null) {
      continue;
    }

    if (
      (binding.valueType === 'string' && typeof value !== 'string') ||
      (binding.valueType === 'boolean' && typeof value !== 'boolean') ||
      (binding.valueType === 'integer' && !Number.isSafeInteger(value))
    ) {
      throw new TypeError(
        `Tool argument "${binding.path.join('.')}" does not match its x-mcp-header type`,
      );
    }

    headers[`Mcp-Param-${binding.headerName}`] = encodeMCPHeaderValue(
      String(value),
    );
  }

  return headers;
}
