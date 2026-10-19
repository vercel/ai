/*
 * Changes the outbound network policy of a running E2B sandbox with
 * `setNetworkPolicy()` and checks from inside the sandbox which hosts are
 * reachable under each policy.
 */
import { HarnessCapabilityUnsupportedError } from '@ai-sdk/harness';
import { createE2BNetworkSandboxSession } from '@ai-sdk/sandbox-e2b';
import { run } from '../lib/run';

const allowedHost = 'example.com';
const otherHost = 'www.iana.org';

run(async () => {
  process.exitCode = 1;

  const session = await createE2BNetworkSandboxSession({
    timeoutMs: 5 * 60 * 1000,
  });
  const setNetworkPolicy = session.setNetworkPolicy;
  if (setNetworkPolicy == null) {
    throw new Error('the session does not support setNetworkPolicy');
  }

  async function canReach(host: string): Promise<boolean> {
    const { exitCode } = await session.run({
      command: `curl --silent --show-error --output /dev/null --max-time 10 https://${host}`,
    });
    return exitCode === 0;
  }

  async function expectReachable(expected: Record<string, boolean>) {
    for (const [host, reachable] of Object.entries(expected)) {
      const actual = await canReach(host);
      console.log(`  ${host}: ${actual ? 'reachable' : 'blocked'}`);
      if (actual !== reachable) {
        throw new Error(
          `expected ${host} to be ${reachable ? 'reachable' : 'blocked'}`,
        );
      }
    }
  }

  try {
    console.log('initial policy');
    await expectReachable({ [allowedHost]: true, [otherHost]: true });

    console.log('deny-all');
    await setNetworkPolicy({ mode: 'deny-all' });
    await expectReachable({ [allowedHost]: false, [otherHost]: false });

    console.log(`custom, allowedHosts: [${allowedHost}]`);
    await setNetworkPolicy({ mode: 'custom', allowedHosts: [allowedHost] });
    await expectReachable({ [allowedHost]: true, [otherHost]: false });

    console.log('allow-all');
    await setNetworkPolicy({ mode: 'allow-all' });
    await expectReachable({ [allowedHost]: true, [otherHost]: true });

    console.log('custom with deniedCIDRs');
    const refused = await setNetworkPolicy({
      mode: 'custom',
      allowedHosts: [allowedHost],
      deniedCIDRs: ['10.0.0.0/8'],
    }).then(
      () => false,
      error => {
        console.log(`  ${String(error)}`);
        return HarnessCapabilityUnsupportedError.isInstance(error);
      },
    );
    if (!refused) {
      throw new Error('expected deniedCIDRs to be refused');
    }
    await expectReachable({ [allowedHost]: true, [otherHost]: true });

    console.log('ok: setNetworkPolicy controls outbound access');
    process.exitCode = 0;
  } finally {
    await session.destroy();
  }
});
