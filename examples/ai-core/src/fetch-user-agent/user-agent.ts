import { createUserAgentFetch } from '@ai-sdk/provider-utils';
import 'dotenv/config';

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
    console.log('Raw response: ', raw);

    const headers = (raw && (raw as any).headers) || {};
    const normalizedHeaders = Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [
        String(key).toLowerCase(),
        String(value),
      ]),
    );
    const echoedUserAgent = normalizedHeaders['user-agent'] || null;

    console.log('User agent: ', echoedUserAgent);
  } catch (error) {
    console.error(error);
  }
}

main().catch(console.error);
