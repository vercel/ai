import { APICallError } from '@ai-sdk/provider';
import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import {
  buildTc3CanonicalRequest,
  createTc3Authorization,
  getTencentCloudErrorStatusCode,
  postTencentCloudApi,
  sha256Hex,
} from './tencent-cloud-api';

describe('buildTc3CanonicalRequest', () => {
  // Worked example from Tencent's "Signature v3" documentation
  // (https://intl.cloud.tencent.com/document/product/377/30988).
  const payload =
    '{"Limit": 1, "Filters": [{"Values": ["unnamed"], "Name": "instance-name"}]}';

  it('hashes the payload as documented', async () => {
    expect(await sha256Hex(payload)).toBe(
      '99d58dfbc6745f6747f36bfca17dee5e6881dc0428a0a36f96199342bc5b4907',
    );
  });

  it('produces the documented canonical request hash', async () => {
    const { canonicalRequest, signedHeaders } = await buildTc3CanonicalRequest({
      payload,
      headers: {
        Host: 'cvm.tencentcloudapi.com',
        'Content-Type': 'application/json; charset=utf-8',
      },
    });

    expect(signedHeaders).toBe('content-type;host');
    expect(await sha256Hex(canonicalRequest)).toBe(
      '2815843035062fffda5fd6f2a44ea8a34818b0dc46f024b8b3786976a3adda7a',
    );
  });
});

describe('createTc3Authorization', () => {
  it('signs a VOD request', async () => {
    // Reference value computed independently from the documented algorithm.
    const authorization = await createTc3Authorization({
      secretId: 'AKIDEXAMPLEEXAMPLEEXAMPLE',
      secretKey: 'EXAMPLESECRETKEYEXAMPLESECRETKEY',
      service: 'vod',
      timestamp: 1794120000,
      payload:
        '{"SubAppId":1500000000,"ModelName":"VS","ModelVersion":"2.0","Prompt":"A cat"}',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        host: 'vod.intl.tencentcloudapi.com',
        'x-tc-action': 'createaigcvideotask',
      },
    });

    expect(authorization).toBe(
      'TC3-HMAC-SHA256 Credential=AKIDEXAMPLEEXAMPLEEXAMPLE/2026-11-08/vod/tc3_request, ' +
        'SignedHeaders=content-type;host;x-tc-action, ' +
        'Signature=20bd5603a92b091b44b53c95c55b2e5f7687cf779aff39688d83229b7252409f',
    );
  });
});

describe('getTencentCloudErrorStatusCode', () => {
  it.each([
    ['AuthFailure.SignatureFailure', 401],
    ['AuthFailure.SecretIdNotFound', 401],
    ['UnauthorizedOperation', 403],
    ['FailedOperation.InvalidVodUser', 403],
    ['ResourceNotFound', 404],
    ['InvalidParameterValue.SubAppId', 400],
    ['MissingParameter', 400],
    ['RequestLimitExceeded', 429],
    ['LimitExceeded', 429],
    ['ResourceUnavailable', 503],
    ['InternalError', 500],
    ['FailedOperation', 500],
    ['SomethingNew', 500],
  ])('maps %s to %i', (code, status) => {
    expect(getTencentCloudErrorStatusCode(code)).toBe(status);
  });
});

describe('postTencentCloudApi', () => {
  const responseSchema = lazySchema(() =>
    zodSchema(z.object({ TaskId: z.string() })),
  );

  const credentials = {
    secretId: 'AKIDEXAMPLEEXAMPLEEXAMPLE',
    secretKey: 'EXAMPLESECRETKEYEXAMPLESECRETKEY',
  };

  const body = {
    SubAppId: 1500000000,
    ModelName: 'VS',
    ModelVersion: '2.0',
    Prompt: 'A cat',
  };

  function mockFetch(responseBody: unknown) {
    return vi.fn().mockResolvedValue(
      new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  }

  it('sends the signed payload and protocol headers', async () => {
    const fetch = mockFetch({
      Response: { TaskId: 'task-1', RequestId: 'req-1' },
    });

    const result = await postTencentCloudApi({
      url: 'https://vod.intl.tencentcloudapi.com',
      service: 'vod',
      action: 'CreateAigcVideoTask',
      version: '2018-07-17',
      credentials,
      body,
      responseSchema,
      headers: { 'Content-Type': 'text/plain', 'x-custom': 'value' },
      timestamp: 1794120000,
      fetch,
    });

    expect(result.value).toStrictEqual({ TaskId: 'task-1' });

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://vod.intl.tencentcloudapi.com');
    expect(init.body).toBe(JSON.stringify(body));

    const headers = new Headers(init.headers);
    expect(headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(headers.get('x-tc-action')).toBe('CreateAigcVideoTask');
    expect(headers.get('x-tc-version')).toBe('2018-07-17');
    expect(headers.get('x-tc-timestamp')).toBe('1794120000');
    expect(headers.get('x-tc-region')).toBeNull();
    expect(headers.get('x-custom')).toBe('value');
    expect(headers.get('authorization')).toBe(
      'TC3-HMAC-SHA256 Credential=AKIDEXAMPLEEXAMPLEEXAMPLE/2026-11-08/vod/tc3_request, ' +
        'SignedHeaders=content-type;host;x-tc-action, ' +
        'Signature=20bd5603a92b091b44b53c95c55b2e5f7687cf779aff39688d83229b7252409f',
    );
  });

  it('sends region and session token headers when provided', async () => {
    const fetch = mockFetch({ Response: { TaskId: 'task-1' } });

    await postTencentCloudApi({
      url: 'https://vod.intl.tencentcloudapi.com',
      service: 'vod',
      action: 'DescribeTaskDetail',
      version: '2018-07-17',
      region: 'ap-singapore',
      credentials: { ...credentials, sessionToken: 'session-token' },
      body: { TaskId: 'task-1' },
      responseSchema,
      timestamp: 1794120000,
      fetch,
    });

    const headers = new Headers(fetch.mock.calls[0][1].headers);
    expect(headers.get('x-tc-region')).toBe('ap-singapore');
    expect(headers.get('x-tc-token')).toBe('session-token');
  });

  it('throws an APICallError for a Response.Error returned with HTTP 200', async () => {
    const fetch = mockFetch({
      Response: {
        Error: {
          Code: 'AuthFailure.SignatureFailure',
          Message: 'The provided credentials could not be validated.',
        },
        RequestId: 'req-1',
      },
    });

    const error = await postTencentCloudApi({
      url: 'https://vod.intl.tencentcloudapi.com',
      service: 'vod',
      action: 'CreateAigcVideoTask',
      version: '2018-07-17',
      credentials,
      body,
      responseSchema,
      timestamp: 1794120000,
      fetch,
    }).catch(e => e);

    expect(APICallError.isInstance(error)).toBe(true);
    expect(error.statusCode).toBe(401);
    expect(error.isRetryable).toBe(false);
    expect(error.message).toBe(
      'AuthFailure.SignatureFailure: The provided credentials could not be validated.',
    );
  });

  it('marks rate limit errors as retryable', async () => {
    const fetch = mockFetch({
      Response: {
        Error: { Code: 'RequestLimitExceeded', Message: 'Too many requests.' },
      },
    });

    const error = await postTencentCloudApi({
      url: 'https://vod.intl.tencentcloudapi.com',
      service: 'vod',
      action: 'CreateAigcVideoTask',
      version: '2018-07-17',
      credentials,
      body,
      responseSchema,
      timestamp: 1794120000,
      fetch,
    }).catch(e => e);

    expect(error.statusCode).toBe(429);
    expect(error.isRetryable).toBe(true);
  });
});
