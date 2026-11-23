/*
 * Verifies that `setNetworkPolicy()` changes the outbound access of a running
 * Modal sandbox, and that a stopped sandbox is only restored with network
 * settings that the caller states again.
 */
import {
  createModalNetworkSandboxSession,
  resumeModalNetworkSandboxSession,
} from '@ai-sdk/sandbox-modal';
import type { HarnessV1NetworkSandboxSession } from '@ai-sdk/harness';
import { run } from '../lib/run';

const allowedHost = 'example.com';
const otherHost = 'api.github.com';

const creationOptions = {
  timeoutMs: 5 * 60 * 1000,
  cpu: 0.25,
  memoryMiB: 512,
};

run(async () => {
  process.exitCode = 1;

  const session = await createModalNetworkSandboxSession({
    sandboxId: `network-policy-${crypto.randomUUID()}`,
    ...creationOptions,
  });
  let activeSession = session;
  try {
    if (session.setNetworkPolicy == null) {
      throw new Error('Modal Sandbox does not support network policies.');
    }

    const checks: Array<{
      label: string;
      expected: { allowedHost: boolean; otherHost: boolean };
    }> = [];
    const check = async (
      label: string,
      expected: { allowedHost: boolean; otherHost: boolean },
    ) => {
      const actual = {
        allowedHost: await canReach({
          session: activeSession,
          host: allowedHost,
        }),
        otherHost: await canReach({ session: activeSession, host: otherHost }),
      };
      console.log(`${label}:`, actual);
      if (
        actual.allowedHost !== expected.allowedHost ||
        actual.otherHost !== expected.otherHost
      ) {
        throw new Error(`unexpected reachability after ${label}`);
      }
      checks.push({ label, expected });
    };

    await check('creation', { allowedHost: true, otherHost: true });

    await session.setNetworkPolicy({ mode: 'deny-all' });
    await check('deny-all', { allowedHost: false, otherHost: false });

    await session.setNetworkPolicy({
      mode: 'custom',
      allowedHosts: [allowedHost],
    });
    await check('custom', { allowedHost: true, otherHost: false });

    await session.setNetworkPolicy({ mode: 'allow-all' });
    await check('allow-all', { allowedHost: true, otherHost: true });

    await session.setNetworkPolicy({
      mode: 'custom',
      allowedHosts: [allowedHost],
    });
    await session.stop();

    let refusal: unknown;
    try {
      activeSession = await resumeModalNetworkSandboxSession({
        sandboxId: session.id,
        ...creationOptions,
      });
    } catch (error) {
      refusal = error;
    }
    if (
      !(refusal instanceof Error) ||
      !refusal.message.includes(
        'Modal does not keep the network settings of a stopped sandbox',
      )
    ) {
      throw new Error(
        `expected resuming without network settings to be rejected, got: ${refusal}`,
      );
    }
    console.log('restore without network settings: rejected');

    activeSession = await resumeModalNetworkSandboxSession({
      sandboxId: session.id,
      ...creationOptions,
      outboundDomainAllowlist: [allowedHost],
      outboundCidrAllowlist: [],
    });
    await check('restore', { allowedHost: true, otherHost: false });

    console.log(`ok: ${checks.length} network policy states took effect`);
    process.exitCode = 0;
  } finally {
    await activeSession.destroy();
  }
});

async function canReach({
  session,
  host,
}: {
  session: HarnessV1NetworkSandboxSession;
  host: string;
}): Promise<boolean> {
  const result = await session.run({
    command: `curl --silent --output /dev/null --max-time 8 https://${host}`,
  });
  return result.exitCode === 0;
}
