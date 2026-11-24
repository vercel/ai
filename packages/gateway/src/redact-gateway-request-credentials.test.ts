import { redactTelemetryValue } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { withGatewayRequestTelemetryRedaction } from './redact-gateway-request-credentials';

describe('withGatewayRequestTelemetryRedaction', () => {
  it('redacts every BYOK value in the telemetry view', () => {
    const body = {
      stateParts: [{ type: 'text', text: 'hello' }],
      fields: {},
      providerOptions: {
        openai: { reasoningEffort: 'low' },
        gateway: {
          tags: ['team-a'],
          byok: {
            openai: [{ apiKey: 'sk-byok-openai' }],
            bedrock: [
              {
                accessKeyId: 'AKIAEXAMPLE',
                secretAccessKey: 'bedrock-secret',
                region: 'us-east-1',
              },
            ],
          },
        },
      },
    };

    const telemetryView = redactTelemetryValue(
      withGatewayRequestTelemetryRedaction(body),
    );

    expect(telemetryView).toStrictEqual({
      stateParts: [{ type: 'text', text: 'hello' }],
      fields: {},
      providerOptions: {
        openai: { reasoningEffort: 'low' },
        gateway: {
          tags: ['team-a'],
          byok: {
            openai: [{ apiKey: '[redacted]' }],
            bedrock: [
              {
                accessKeyId: '[redacted]',
                secretAccessKey: '[redacted]',
                region: '[redacted]',
              },
            ],
          },
        },
      },
    });

    // The request the Gateway receives keeps the credentials.
    const serialized = JSON.stringify(body);
    expect(serialized).toContain('sk-byok-openai');
    expect(serialized).toContain('bedrock-secret');
  });

  it('keeps the serialized request body unchanged', () => {
    const body = {
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      providerOptions: {
        gateway: { byok: { openai: [{ apiKey: 'secret' }] } },
      },
    };

    expect(JSON.stringify(withGatewayRequestTelemetryRedaction(body))).toBe(
      JSON.stringify(body),
    );
  });

  it('redacts BYOK credentials in batch request options', () => {
    const body = {
      requests: [
        {
          id: 'request-1',
          type: 'text',
          modelId: 'openai/gpt-5',
          options: {
            prompt: [],
            providerOptions: {
              gateway: { byok: { openai: [{ apiKey: 'sk-byok-batch' }] } },
            },
          },
        },
      ],
    };

    const telemetryView = redactTelemetryValue(
      withGatewayRequestTelemetryRedaction(body),
    );

    expect(telemetryView).toStrictEqual({
      requests: [
        {
          id: 'request-1',
          type: 'text',
          modelId: 'openai/gpt-5',
          options: {
            prompt: [],
            providerOptions: {
              gateway: { byok: { openai: [{ apiKey: '[redacted]' }] } },
            },
          },
        },
      ],
    });
    expect(JSON.stringify(body)).toContain('sk-byok-batch');
  });

  it('preserves bodies without BYOK credentials', () => {
    const withoutByok = {
      prompt: [],
      providerOptions: { gateway: { tags: ['team-a'] } },
    };
    expect(withGatewayRequestTelemetryRedaction(withoutByok)).toBe(withoutByok);

    const withoutProviderOptions = { prompt: [] };
    expect(withGatewayRequestTelemetryRedaction(withoutProviderOptions)).toBe(
      withoutProviderOptions,
    );

    expect(withGatewayRequestTelemetryRedaction(undefined)).toBeUndefined();
  });
});
