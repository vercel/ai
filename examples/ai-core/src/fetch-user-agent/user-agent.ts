import { createUserAgentFetch, withUserAgentSuffix } from '@ai-sdk/provider-utils';
import 'dotenv/config';

async function main() {
  try {
    const userAgentFetch = createUserAgentFetch();

    const headersFromUser = {
      'Content-Type': 'application/json',
      'User-Agent': 'MyApp/1.0.0',
    }
    const response = await userAgentFetch(
      'https://echo.free.beeceptor.com/sample-request?test=1',
      {
        method: 'POST',
        headers: withUserAgentSuffix(headersFromUser, 'ai/0.0.0-test'),
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
