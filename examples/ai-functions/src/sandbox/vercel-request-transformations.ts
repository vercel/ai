import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { run } from '../lib/run';

const echoHost = 'httpbin.org';
const injectedHeaderValue = 'injected-outside-the-sandbox';

run(async () => {
  const provider = createVercelSandbox({
    runtime: 'node24',
    timeout: 10 * 60 * 1000,
    networkPolicy: 'deny-all',
  });
  const session = await provider.createSession();

  try {
    if (session.addRequestTransformations == null) {
      throw new Error(
        'Vercel Sandbox does not support request transformations.',
      );
    }
    if (session.setNetworkPolicy == null) {
      throw new Error('Vercel Sandbox does not support network policies.');
    }

    await session.addRequestTransformations([
      {
        match: {
          host: echoHost,
          path: { exact: '/headers' },
        },
        transform: {
          headers: { 'x-ai-sdk-example': injectedHeaderValue },
        },
      },
    ]);

    await session.setNetworkPolicy({
      mode: 'custom',
      allowedHosts: [echoHost],
    });

    const result = await session.run({
      command:
        `node -e "fetch('https://${echoHost}/headers')` +
        `.then(async response => { if (!response.ok) throw new Error(String(response.status)); console.log(await response.text()); })"`,
    });

    if (result.exitCode !== 0) {
      throw new Error(`Echo request failed: ${result.stderr}`);
    }
    if (!result.stdout.includes(injectedHeaderValue)) {
      throw new Error('The echo response did not contain the injected header.');
    }

    console.log(result.stdout);
  } finally {
    await session.destroy();
  }
});
