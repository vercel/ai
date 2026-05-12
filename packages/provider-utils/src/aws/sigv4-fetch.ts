import { AwsV4Signer } from 'aws4fetch';
import { combineHeaders } from '../combine-headers';
import { getRuntimeEnvironmentUserAgent } from '../get-runtime-environment-user-agent';
import { normalizeHeaders } from '../normalize-headers';
import { withUserAgentSuffix } from '../with-user-agent-suffix';
import type { FetchFunction } from '../fetch-function';

export interface AwsSigV4Credentials {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export interface CreateSigV4FetchFunctionOptions {
  /**
   * AWS service name used as the SigV4 service scope. Examples: `bedrock`,
   * `aws-external-anthropic`.
   */
  service: string;

  /**
   * User-agent suffix appended to outgoing requests. Typically of the form
   * `ai-sdk/<provider>/<version>`.
   */
  userAgentSuffix: string;

  /**
   * Underlying fetch implementation. Defaults to `globalThis.fetch`, resolved
   * lazily so runtime patches (telemetry, mocks) take effect.
   */
  fetch?: FetchFunction;
}

/**
 * Creates a fetch function that signs outgoing POST requests with AWS
 * Signature Version 4. Non-POST requests and POSTs without a body pass through
 * unsigned but still receive the user-agent suffix.
 */
export function createSigV4FetchFunction(
  getCredentials: () => AwsSigV4Credentials | PromiseLike<AwsSigV4Credentials>,
  options: CreateSigV4FetchFunctionOptions,
): FetchFunction {
  const { service, userAgentSuffix, fetch } = options;

  return async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const effectiveFetch = fetch ?? globalThis.fetch;
    const request = input instanceof Request ? input : undefined;
    const originalHeaders = combineHeaders(
      normalizeHeaders(request?.headers),
      normalizeHeaders(init?.headers),
    );
    const headersWithUserAgent = withUserAgentSuffix(
      originalHeaders,
      userAgentSuffix,
      getRuntimeEnvironmentUserAgent(),
    );

    let effectiveBody: BodyInit | undefined = init?.body ?? undefined;
    if (effectiveBody === undefined && request && request.body !== null) {
      try {
        effectiveBody = await request.clone().text();
      } catch {}
    }

    const effectiveMethod = init?.method ?? request?.method;

    if (effectiveMethod?.toUpperCase() !== 'POST' || !effectiveBody) {
      return effectiveFetch(input, {
        ...init,
        headers: headersWithUserAgent as HeadersInit,
      });
    }

    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    const body = prepareBodyString(effectiveBody);
    const credentials = await getCredentials();
    const signer = new AwsV4Signer({
      url,
      method: 'POST',
      headers: Object.entries(headersWithUserAgent),
      body,
      region: credentials.region,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
      service,
    });

    const signingResult = await signer.sign();
    const signedHeaders = normalizeHeaders(signingResult.headers);
    const combinedHeaders = combineHeaders(headersWithUserAgent, signedHeaders);

    return effectiveFetch(input, {
      ...init,
      body,
      headers: combinedHeaders as HeadersInit,
    });
  };
}

function prepareBodyString(body: BodyInit | undefined): string {
  if (typeof body === 'string') {
    return body;
  } else if (body instanceof Uint8Array) {
    return new TextDecoder().decode(body);
  } else if (body instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(body));
  } else {
    return JSON.stringify(body);
  }
}
