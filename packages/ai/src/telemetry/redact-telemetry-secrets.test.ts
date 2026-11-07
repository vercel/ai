import { describe, expect, it } from 'vitest';
import { TypeValidationError } from '@ai-sdk/provider';
import { redactTelemetrySecrets } from './redact-telemetry-secrets';

describe('redactTelemetrySecrets', () => {
  it.each(['object', 'string', 'tuple', 'string-entry', 'object-entry'])(
    'redacts malformed domainSecrets: %s',
    shape => {
      const secret = 'synthetic-malformed-credential';
      const domainSecrets =
        shape === 'object'
          ? { value: secret }
          : shape === 'string'
            ? secret
            : shape === 'tuple'
              ? [['example.com', 'KEY', secret]]
              : shape === 'string-entry'
                ? [secret]
                : [{ token: secret }];
      for (const container of ['container', 'environment']) {
        const args = { [container]: { networkPolicy: { domainSecrets } } };
        const error = new TypeValidationError({
          value: args,
          cause: new Error('invalid configuration'),
        });
        const redacted = redactTelemetrySecrets(error);
        expect(JSON.stringify(redacted)).not.toContain(secret);
        expect(redacted.message).not.toContain(secret);
        expect(redacted.stack).not.toContain(secret);
        const event = {
          tools: [
            {
              type: 'provider',
              id: `openai.${container === 'container' ? 'code_interpreter' : 'shell'}`,
              args,
            },
          ],
        };
        expect(JSON.stringify(redactTelemetrySecrets(event))).not.toContain(
          secret,
        );
        expect(error.message).toContain(secret);
      }
    },
  );

  it.each(['$&', '$`', "$'", '$$'])(
    'keeps replacement patterns literal in validation error stacks: %s',
    pattern => {
      const secret = 'synthetic-stack-credential';
      const error = new TypeValidationError({
        value: {
          container: {
            fileIds: [pattern],
            networkPolicy: { domainSecrets: [{ value: secret }] },
          },
        },
        cause: new Error('invalid configuration'),
      });
      const redacted = redactTelemetrySecrets(error);
      expect(redacted.stack).not.toContain(secret);
      expect(redacted.stack).toContain(redacted.message);
    },
  );

  it.each(['container', 'environment'])(
    'redacts invalid %s arguments in validation error values, messages, and stacks',
    container => {
      const secret = 'synthetic-validation-credential';
      const args = {
        [container]: {
          networkPolicy: { domainSecrets: [{ value: secret }] },
        },
      };
      const error = new TypeValidationError({
        value: args,
        cause: new Error('invalid configuration'),
      });
      const redacted = redactTelemetrySecrets(error);
      expect(TypeValidationError.isInstance(redacted)).toBe(true);
      expect(JSON.stringify(redacted.value)).not.toContain(secret);
      expect(redacted.message).toContain('[redacted]');
      expect(redacted.stack).not.toContain(secret);
      expect(error.value).toBe(args);
      expect(error.message).toContain(secret);
      expect(error.stack).toContain(secret);
    },
  );

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

  it.each(['keep', '<html>ordinary response</html>', 'invalid JSON'])(
    'preserves unrelated non-JSON metadata: %s',
    body => {
      const event = { request: { body }, response: { body } };
      expect(redactTelemetrySecrets(event)).toBe(event);
    },
  );

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
    const serialized = JSON.stringify(body);
    const escaped = serialized.replace(
      'domain_secrets',
      'domain\\u005fsecrets',
    );
    for (const key of ['request', 'response']) {
      const redacted = redactTelemetrySecrets({ [key]: { body: escaped } });
      expect(
        JSON.parse(redacted[key].body).tools[0].container.network_policy
          .domain_secrets,
      ).toEqual([{ value: '[redacted]' }]);
    }
    for (const unsafeBody of [
      serialized.slice(0, -1),
      serialized.replace('{', '{"__proto__": {},'),
      escaped.slice(0, -1),
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
