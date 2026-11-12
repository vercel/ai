import { APICallError } from '@ai-sdk/provider';
import {
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  type FetchFunction,
  type FlexibleSchema,
  lazySchema,
  postToApi,
  type ResponseHandler,
  safeValidateTypes,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export type TencentCloudCredentials = {
  secretId: string;
  secretKey: string;
  sessionToken?: string;
};

const TC3_ALGORITHM = 'TC3-HMAC-SHA256';
const TC3_CONTENT_TYPE = 'application/json; charset=utf-8';

const textEncoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export async function sha256Hex(value: string): Promise<string> {
  return toHex(
    await crypto.subtle.digest('SHA-256', textEncoder.encode(value)),
  );
}

async function hmacSha256(
  key: ArrayBuffer | Uint8Array<ArrayBuffer>,
  value: string,
): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', cryptoKey, textEncoder.encode(value));
}

/**
 * Builds the TC3 canonical request for a POST to `/` with an empty query.
 *
 * @see https://intl.cloud.tencent.com/document/product/377/30988
 */
export async function buildTc3CanonicalRequest({
  payload,
  headers,
}: {
  payload: string;
  /** Headers to sign. Names are lowercased and sorted. */
  headers: Record<string, string>;
}): Promise<{ canonicalRequest: string; signedHeaders: string }> {
  const entries = Object.entries(headers)
    .map(([name, value]) => [name.toLowerCase(), value.trim()] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const canonicalHeaders = entries
    .map(([name, value]) => `${name}:${value}\n`)
    .join('');
  const signedHeaders = entries.map(([name]) => name).join(';');

  return {
    canonicalRequest: [
      'POST',
      '/',
      '',
      canonicalHeaders,
      signedHeaders,
      await sha256Hex(payload),
    ].join('\n'),
    signedHeaders,
  };
}

/**
 * Computes the `Authorization` header value for a Tencent Cloud API 3.0
 * request signed with TC3-HMAC-SHA256.
 */
export async function createTc3Authorization({
  secretId,
  secretKey,
  service,
  timestamp,
  payload,
  headers,
}: {
  secretId: string;
  secretKey: string;
  service: string;
  /** Unix timestamp in seconds; must match the `X-TC-Timestamp` header. */
  timestamp: number;
  payload: string;
  headers: Record<string, string>;
}): Promise<string> {
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const credentialScope = `${date}/${service}/tc3_request`;

  const { canonicalRequest, signedHeaders } = await buildTc3CanonicalRequest({
    payload,
    headers,
  });

  const stringToSign = [
    TC3_ALGORITHM,
    String(timestamp),
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  const secretDate = await hmacSha256(
    textEncoder.encode(`TC3${secretKey}`),
    date,
  );
  const secretService = await hmacSha256(secretDate, service);
  const secretSigning = await hmacSha256(secretService, 'tc3_request');
  const signature = toHex(await hmacSha256(secretSigning, stringToSign));

  return (
    `${TC3_ALGORITHM} Credential=${secretId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`
  );
}

const createTencentCloudErrorSchema = () =>
  z.object({
    Code: z.string(),
    Message: z.string(),
  });

export const tencentCloudEnvelopeSchema = lazySchema(() =>
  zodSchema(
    z.object({
      Response: z.looseObject({
        Error: createTencentCloudErrorSchema().nullish(),
        RequestId: z.string().nullish(),
      }),
    }),
  ),
);

const tencentCloudErrorEnvelopeSchema = lazySchema(() =>
  zodSchema(
    z.object({
      Response: z.object({
        Error: createTencentCloudErrorSchema(),
        RequestId: z.string().nullish(),
      }),
    }),
  ),
);

/**
 * Tencent Cloud API 3.0 reports failures with HTTP 200 and a `Response.Error`
 * code. Map the code family to the HTTP status it stands for so retry and
 * failover logic sees the real failure class.
 *
 * @see https://www.tencentcloud.com/document/api/266/34188
 */
export function getTencentCloudErrorStatusCode(code: string): number {
  const family = code.split('.')[0];
  switch (family) {
    case 'AuthFailure':
      return 401;
    case 'UnauthorizedOperation':
      return 403;
    case 'ResourceNotFound':
    case 'InvalidAction':
    case 'NoSuchProduct':
    case 'NoSuchVersion':
      return 404;
    case 'LimitExceeded':
    case 'RequestLimitExceeded':
      return 429;
    case 'InvalidParameter':
    case 'InvalidParameterValue':
    case 'InvalidRequest':
    case 'MissingParameter':
    case 'RequestSizeLimitExceeded':
    case 'UnknownParameter':
    case 'UnsupportedOperation':
    case 'UnsupportedProtocol':
    case 'UnsupportedRegion':
      return 400;
    case 'ResourceInsufficient':
    case 'ResourceUnavailable':
    case 'ServiceUnavailable':
      return 503;
    case 'FailedOperation':
      return code === 'FailedOperation.InvalidVodUser' ? 403 : 500;
    default:
      return 500;
  }
}

function formatTencentCloudErrorMessage(error: {
  Code: string;
  Message: string;
}): string {
  return `${error.Code}: ${error.Message}`;
}

const tencentCloudFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: tencentCloudErrorEnvelopeSchema,
  errorToMessage: data => formatTencentCloudErrorMessage(data.Response.Error),
});

function createTencentCloudResponseHandler<T>(
  schema: FlexibleSchema<T>,
): ResponseHandler<T> {
  const envelopeHandler = createJsonResponseHandler(tencentCloudEnvelopeSchema);

  return async options => {
    const { value, rawValue, responseHeaders } = await envelopeHandler(options);
    const error = value.Response.Error;

    if (error != null) {
      throw new APICallError({
        message: formatTencentCloudErrorMessage(error),
        url: options.url,
        requestBodyValues: options.requestBodyValues,
        statusCode: getTencentCloudErrorStatusCode(error.Code),
        responseHeaders,
        responseBody: JSON.stringify(rawValue),
        data: value,
      });
    }

    const result = await safeValidateTypes({ value: value.Response, schema });
    if (!result.success) {
      throw new APICallError({
        message: 'Invalid JSON response',
        cause: result.error,
        url: options.url,
        requestBodyValues: options.requestBodyValues,
        statusCode: options.response.status,
        responseHeaders,
        responseBody: JSON.stringify(rawValue),
      });
    }

    return { value: result.value, rawValue, responseHeaders };
  };
}

/**
 * Calls a Tencent Cloud API 3.0 action with a TC3-signed JSON POST and returns
 * the validated `Response` object.
 */
export async function postTencentCloudApi<T>({
  url,
  service,
  action,
  version,
  region,
  credentials,
  body,
  responseSchema,
  headers,
  timestamp,
  fetch,
  abortSignal,
}: {
  url: string;
  service: string;
  action: string;
  version: string;
  region?: string;
  credentials: TencentCloudCredentials;
  body: Record<string, unknown>;
  responseSchema: FlexibleSchema<T>;
  headers?: Record<string, string | undefined>;
  /** Unix timestamp in seconds used for the signature. */
  timestamp: number;
  fetch?: FetchFunction;
  abortSignal?: AbortSignal;
}): Promise<{ value: T; responseHeaders?: Record<string, string> }> {
  const payload = JSON.stringify(body);

  const authorization = await createTc3Authorization({
    secretId: credentials.secretId,
    secretKey: credentials.secretKey,
    service,
    timestamp,
    payload,
    headers: {
      'content-type': TC3_CONTENT_TYPE,
      host: new URL(url).host,
      'x-tc-action': action.toLowerCase(),
    },
  });

  const protocolHeaders: Record<string, string> = {
    authorization,
    'content-type': TC3_CONTENT_TYPE,
    'x-tc-action': action,
    'x-tc-timestamp': String(timestamp),
    'x-tc-version': version,
    ...(region != null ? { 'x-tc-region': region } : {}),
    ...(credentials.sessionToken != null
      ? { 'x-tc-token': credentials.sessionToken }
      : {}),
  };

  // Caller headers must not shadow the signed protocol headers under a
  // different casing, or the request would carry two conflicting values.
  const callerHeaders = Object.fromEntries(
    Object.entries(headers ?? {}).filter(
      ([name]) => !(name.toLowerCase() in protocolHeaders),
    ),
  );

  return postToApi({
    url,
    headers: { ...callerHeaders, ...protocolHeaders },
    body: { content: payload, values: body },
    successfulResponseHandler:
      createTencentCloudResponseHandler(responseSchema),
    failedResponseHandler: tencentCloudFailedResponseHandler,
    abortSignal,
    fetch,
  });
}
