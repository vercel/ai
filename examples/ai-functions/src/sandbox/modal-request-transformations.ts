/*
 * Verifies that a Modal sandbox created with `requestTransformations: true`
 * gets the headers of its request transformations injected outside the
 * sandbox, for the whole host, that a rule Modal cannot express is rejected,
 * and that the transformations work again after a stop and a restore.
 */
import {
  createModalNetworkSandboxSession,
  resumeModalNetworkSandboxSession,
} from '@ai-sdk/sandbox-modal';
import type { HarnessV1NetworkSandboxSession } from '@ai-sdk/harness';
import { run } from '../lib/run';

const echoHost = 'postman-echo.com';
const headerName = 'x-ai-sdk-example';
const placeholderValue = 'placeholder-inside-the-sandbox';
const injectedValue = 'injected-outside-the-sandbox';
const rotatedValue = 'rotated-outside-the-sandbox';

const creationOptions = {
  timeoutMs: 5 * 60 * 1000,
  cpu: 0.25,
  memoryMiB: 512,
  requestTransformations: true,
};

run(async () => {
  process.exitCode = 1;

  const session = await createModalNetworkSandboxSession({
    sandboxId: `request-transformations-${crypto.randomUUID()}`,
    ...creationOptions,
  });
  let activeSession = session;
  try {
    const expectHeader = async (
      label: string,
      path: string,
      expected: string,
    ) => {
      const actual = await readEchoedHeader({ session: activeSession, path });
      console.log(`${label}:`, actual);
      if (actual !== expected) {
        throw new Error(`expected ${expected} after ${label}, got ${actual}`);
      }
    };

    await expectHeader('creation', '/headers', placeholderValue);

    // The matchers limit the rule to one path and to requests that carry the
    // placeholder. Modal applies it to every request to the host.
    const transformation = {
      match: {
        host: echoHost,
        path: { exact: '/headers' },
        headers: [
          {
            key: { exact: headerName },
            value: { exact: placeholderValue },
          },
        ],
      },
      transform: { headers: { [headerName]: injectedValue } },
    };
    await addRequestTransformations(session, [transformation]);
    await expectHeader('matching path', '/headers', injectedValue);
    await expectHeader('other path of the host', '/get', injectedValue);

    // The latest value for a host and header replaces the earlier one,
    // whatever the other matchers of the rule are.
    await addRequestTransformations(session, [
      {
        match: { host: echoHost },
        transform: { headers: { [headerName]: rotatedValue } },
      },
    ]);
    await expectHeader('rotated value', '/headers', rotatedValue);

    for (const [label, unsupported] of [
      [
        'method matcher',
        [
          {
            match: { host: echoHost, method: ['POST'] },
            transform: { headers: { [headerName]: injectedValue } },
          },
        ],
      ],
      [
        'two values for the same host and header in one call',
        [
          {
            match: { host: echoHost, path: { exact: '/headers' } },
            transform: { headers: { [headerName]: injectedValue } },
          },
          {
            match: { host: echoHost, path: { exact: '/get' } },
            transform: { headers: { [headerName]: placeholderValue } },
          },
        ],
      ],
    ] as const) {
      let refusal: unknown;
      try {
        await addRequestTransformations(session, unsupported);
      } catch (error) {
        refusal = error;
      }
      if (
        !(refusal instanceof Error) ||
        !refusal.message.includes('every request to its host')
      ) {
        throw new Error(`expected ${label} to be rejected, got: ${refusal}`);
      }
      console.log(`${label}: rejected`);
    }
    await expectHeader('after rejected rules', '/headers', rotatedValue);

    await session.stop();
    activeSession = await resumeModalNetworkSandboxSession({
      sandboxId: session.id,
      ...creationOptions,
      blockNetwork: false,
    });
    await expectHeader('restore', '/headers', placeholderValue);
    await addRequestTransformations(activeSession, [transformation]);
    await expectHeader('restore with the rule', '/headers', injectedValue);

    console.log('ok: request transformations took effect outside the sandbox');
    process.exitCode = 0;
  } finally {
    await activeSession.destroy();
  }
});

async function addRequestTransformations(
  session: HarnessV1NetworkSandboxSession,
  transformations: Parameters<
    NonNullable<HarnessV1NetworkSandboxSession['addRequestTransformations']>
  >[0],
): Promise<void> {
  if (session.addRequestTransformations == null) {
    throw new Error(
      'The Modal sandbox session does not support request transformations.',
    );
  }
  await session.addRequestTransformations(transformations);
}

async function readEchoedHeader({
  session,
  path,
}: {
  session: HarnessV1NetworkSandboxSession;
  path: string;
}): Promise<string | undefined> {
  const result = await session.run({
    command: `curl --silent --show-error --max-time 20 --header '${headerName}: ${placeholderValue}' https://${echoHost}${path}`,
  });
  if (result.exitCode !== 0) {
    throw new Error(`Echo request failed: ${result.stderr}`);
  }
  const { headers } = JSON.parse(result.stdout) as {
    headers: Record<string, string>;
  };
  return headers[headerName];
}
