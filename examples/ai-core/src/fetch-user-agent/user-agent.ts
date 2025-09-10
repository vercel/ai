import { createUserAgentFetch } from '@ai-sdk/provider-utils';
import 'dotenv/config';
import { z } from 'zod/v4';

const EchoResponseSchema = z.object({
  method: z.string(),
  protocol: z.string().optional(),
  host: z.string(),
  path: z.string(),
  ip: z.string().optional(),
  headers: z.record(z.string(), z.string()),
  parsedQueryParams: z.record(z.string(), z.any()).optional(),
  parsedBody: z.any().optional(),
});

async function main() {
  try {
    const userAgentFetch = createUserAgentFetch();

    const response = await userAgentFetch(
      'https://echo.free.beeceptor.com/sample-request?test=1',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'value' }),
      },
    );

    const raw = await response.json();
    const parsed = EchoResponseSchema.parse(raw);

    const normalizedHeaders = Object.fromEntries(
      Object.entries(parsed.headers || {}).map(([key, value]) => [
        key.toLowerCase(),
        value,
      ]),
    );
    const echoedUserAgent = normalizedHeaders['user-agent'] || null;

    const result = {
      method: parsed.method,
      path: parsed.path,
      userAgent: echoedUserAgent,
      headers: parsed.headers,
      parsedQueryParams: parsed.parsedQueryParams ?? {},
      parsedBody: parsed.parsedBody ?? null,
    };

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error);
  }
}

main().catch(console.error);
