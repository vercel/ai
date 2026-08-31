export type OpenCodeObject = Record<string, unknown>;

export type OpenCodeMessageInfo = {
  id?: unknown;
  sessionID?: unknown;
  role?: unknown;
  type?: unknown;
  providerID?: unknown;
  modelID?: unknown;
  tokens?: unknown;
};

export type OpenCodeEventProperties = OpenCodeObject & {
  info?: OpenCodeMessageInfo;
  provider?: { metadata?: unknown };
  source?: { callID?: unknown };
  status?: {
    type?: unknown;
    attempt?: unknown;
    message?: unknown;
  };
};

export type OpenCodeEvent = {
  id?: string;
  type?: string;
  properties?: OpenCodeEventProperties;
};

export function asOpenCodeObject(value: unknown): OpenCodeObject | undefined {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as OpenCodeObject)
    : undefined;
}
