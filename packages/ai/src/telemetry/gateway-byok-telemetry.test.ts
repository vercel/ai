import { createGateway } from '@ai-sdk/gateway';
import { describe, expect, it, vi } from 'vitest';
import { experimental_extract as extract } from '../extract';
import { generateText } from '../generate-text';

const BYOK_SECRET = 'sk-byok-telemetry-secret';
const byok = { openai: [{ apiKey: BYOK_SECRET }] };

/** A Gateway whose requests all fail with an HTTP 400 error response. */
function createFailingGateway() {
  return createGateway({
    apiKey: 'test-gateway-key',
    fetch: vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(JSON.stringify({ error: { message: 'bad request' } }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
    ),
  });
}

describe('Gateway BYOK credentials in telemetry', () => {
  it('keeps BYOK credentials out of telemetry integration errors', async () => {
    const gateway = createFailingGateway();
    const onError = vi.fn();

    await expect(
      generateText({
        model: gateway('openai/gpt-5'),
        prompt: 'hello',
        providerOptions: { gateway: { byok } },
        telemetry: { integrations: { onError } },
      }),
    ).rejects.toThrow();

    expect(onError).toHaveBeenCalledTimes(1);
    const event = onError.mock.calls[0]![0];
    expect(JSON.stringify(event)).not.toContain(BYOK_SECRET);
    expect(JSON.stringify(event.error)).not.toContain(BYOK_SECRET);
  });

  it('keeps BYOK credentials out of telemetry integration errors on extraction', async () => {
    const gateway = createFailingGateway();
    const onError = vi.fn();

    await expect(
      extract({
        model: gateway.extraction('openai/gpt-5'),
        state: 'Invoice INV-2041',
        fields: { invoiceNumber: { type: 'text' } },
        providerOptions: { gateway: { byok } },
        telemetry: { integrations: { onError } },
      }),
    ).rejects.toThrow();

    expect(onError).toHaveBeenCalledTimes(1);
    const event = onError.mock.calls[0]![0];
    expect(JSON.stringify(event)).not.toContain(BYOK_SECRET);
    expect(JSON.stringify(event.error)).not.toContain(BYOK_SECRET);
  });
});
