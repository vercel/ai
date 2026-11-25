import { withTelemetryRedaction } from '@ai-sdk/provider-utils';

const REDACTED = '[redacted]';

/**
 * Gateway request bodies can carry request-scoped BYOK credentials in
 * `providerOptions.gateway.byok`. The credentials must reach the Gateway and
 * stay on application-facing errors, but telemetry-only copies must not expose
 * them.
 */
export function withGatewayRequestTelemetryRedaction<T>(value: T): T {
  if (!isRecord(value)) return value;

  const body = value as Record<string, unknown>;
  if (!hasByok(body.providerOptions) && !hasRequestByok(body.requests)) {
    return value;
  }

  return withTelemetryRedaction(body, redacted => ({
    ...redacted,
    ...(hasByok(redacted.providerOptions) && {
      providerOptions: redactProviderOptions(redacted.providerOptions),
    }),
    ...(Array.isArray(redacted.requests) && {
      requests: redacted.requests.map(redactRequestProviderOptions),
    }),
  })) as T;
}

/** Batch bodies nest the same provider options in every request's options. */
function redactRequestProviderOptions(request: unknown): unknown {
  if (!isRecord(request) || !isRecord(request.options)) return request;

  const options = request.options;
  if (!hasByok(options.providerOptions)) return request;

  return {
    ...request,
    options: {
      ...options,
      providerOptions: redactProviderOptions(options.providerOptions),
    },
  };
}

function redactProviderOptions(value: unknown): unknown {
  if (!isRecord(value) || !isRecord(value.gateway)) return value;

  return {
    ...value,
    gateway: { ...value.gateway, byok: redactByok(value.gateway.byok) },
  };
}

/** Keep provider names and credential shapes; replace every BYOK value. */
function redactByok(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactByok);

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, redactByok(entry)]),
    );
  }

  return REDACTED;
}

function hasByok(providerOptions: unknown): boolean {
  return (
    isRecord(providerOptions) &&
    isRecord(providerOptions.gateway) &&
    providerOptions.gateway.byok !== undefined
  );
}

function hasRequestByok(requests: unknown): boolean {
  return (
    Array.isArray(requests) &&
    requests.some(request => {
      if (!isRecord(request) || !isRecord(request.options)) return false;
      return hasByok(request.options.providerOptions);
    })
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
