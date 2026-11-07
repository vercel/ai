import { describe, expect, it } from 'vitest';
import { redactTelemetrySecrets } from './redact-telemetry-secrets';

describe('redactTelemetrySecrets', () => {
  it.each(['code_interpreter', 'shell'])(
    'redacts %s definitions and request bodies without mutating originals',
    type => {
      const container = type === 'shell' ? 'environment' : 'container';
      const secrets = [{ domain: 'example.com', name: 'KEY', value: 'secret' }];
      const tool = {
        type: 'provider',
        id: `openai.${type}`,
        args: { [container]: { networkPolicy: { domainSecrets: secrets } } },
      };
      const rawTool = {
        type,
        [container]: { network_policy: { domain_secrets: secrets } },
      };
      const request = { body: JSON.stringify({ tools: [rawTool] }) };
      const event = Object.freeze({
        tools: { tool },
        stepTools: [tool],
        request,
        response: { body: { tools: [rawTool] } },
        steps: [{ request }],
      });

      const redacted = redactTelemetrySecrets(event);
      expect(JSON.stringify(redacted)).not.toContain('"secret"');
      expect(JSON.stringify(redacted)).toContain('[redacted]');
      expect(JSON.stringify(event)).toContain('"secret"');
      expect(
        redacted.tools.tool.args[container].networkPolicy.domainSecrets,
      ).toEqual([{ domain: 'example.com', name: 'KEY', value: '[redacted]' }]);
      expect(
        JSON.parse(redacted.request.body).tools[0][container].network_policy
          .domain_secrets,
      ).toEqual([{ domain: 'example.com', name: 'KEY', value: '[redacted]' }]);
      expect(redacted.steps[0].request).toEqual(redacted.request);
    },
  );

  it('preserves user data, unrelated tools, and unchanged request serialization', () => {
    const userData = {
      container: {
        networkPolicy: { domainSecrets: [{ value: 'ordinary-input' }] },
      },
    };
    const event = {
      tools: { tool: { type: 'function', args: userData } },
      request: { body: '{ "tools": [], "input": "Hello" }' },
      runtimeContext: userData,
    };
    expect(redactTelemetrySecrets(event)).toBe(event);
  });

  it('redacts structured request bodies and safely handles unsafe JSON', () => {
    const body = {
      tools: [
        {
          type: 'code_interpreter',
          container: {
            network_policy: { domain_secrets: [{ value: 'secret' }] },
          },
        },
      ],
    };
    expect(
      JSON.stringify(redactTelemetrySecrets({ request: { body } })),
    ).not.toContain('"secret"');
    for (const unsafeBody of [
      'invalid JSON',
      '{"__proto__": {}, "tools": []}',
    ]) {
      expect(redactTelemetrySecrets({ request: { body: unsafeBody } })).toEqual(
        { request: { body: '[redacted]' } },
      );
    }
  });

  it('preserves result prototypes and redacts errors with cyclic causes', () => {
    const body = {
      tools: [
        {
          type: 'code_interpreter',
          container: {
            network_policy: { domain_secrets: [{ value: 'secret' }] },
          },
        },
      ],
    };
    const error = Object.assign(new Error('provider failed'), {
      requestBodyValues: body,
      cause: undefined as unknown,
    });
    error.cause = error;
    const redacted = redactTelemetrySecrets(error);
    expect(redacted).toBeInstanceOf(Error);
    expect(redacted.message).toBe(error.message);
    expect(redacted.stack).toBe(error.stack);
    expect(redacted.cause).toBe(redacted);
    expect(JSON.stringify(redacted.requestBodyValues)).not.toContain(
      '"secret"',
    );
    expect(JSON.stringify(error.requestBodyValues)).toContain('"secret"');
  });
});
