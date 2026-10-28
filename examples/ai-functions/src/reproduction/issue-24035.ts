import 'dotenv/config';
import assert from 'node:assert/strict';
import { HarnessCapabilityUnsupportedError } from '@ai-sdk/harness';
import { createOpenCode } from '@ai-sdk/harness-opencode';
import { createVercelNetworkSandboxSessionFromNativeSandbox } from '@ai-sdk/sandbox-vercel';
import { Sandbox, type NetworkPolicy } from '@vercel/sandbox';

// POST /-/ping does not publish or modify a package.
const initialPolicy = {
  allow: {
    'registry.npmjs.org': [
      {
        match: { method: ['PUT', 'POST', 'DELETE'] },
        response: { statusCode: 403 },
      },
    ],
    'example.com': [],
  },
} satisfies NetworkPolicy;

const transformations = [
  {
    match: { host: 'example.com' },
    transform: { headers: { 'x-example': '1' } },
  },
];

async function main() {
  const providerPolicies: unknown[] = [];
  const sandbox = await Sandbox.create({
    fetch: async (input, init) => {
      const response = await fetch(input, init);
      if (response.headers.get('content-type')?.includes('application/json')) {
        const json = await response.clone().json();
        const policy =
          json.session?.networkPolicy ?? json.sandbox?.networkPolicy;
        if (policy != null) {
          providerPolicies.push(policy);
        }
      }
      return response;
    },
    ...(process.env.VERCEL_TOKEN
      ? {
          token: process.env.VERCEL_TOKEN,
          teamId: process.env.VERCEL_TEAM_ID,
          projectId: process.env.VERCEL_PROJECT_ID,
        }
      : {}),
    timeout: 120_000,
    networkPolicy: initialPolicy,
  });
  async function probe(method: string) {
    const result = await sandbox.runCommand('curl', [
      '--silent',
      '--show-error',
      '--max-time',
      '15',
      '--request',
      method,
      '--write-out',
      '\n%{http_code}',
      'https://registry.npmjs.org/-/ping',
    ]);
    assert.equal(result.exitCode, 0, await result.stderr());
    return (await result.stdout()).trim();
  }

  try {
    const initial = sandbox.currentSession().networkPolicy;
    const blocked = await probe('POST');
    assert.match(
      blocked,
      /(?:^|\n)403$/,
      'Native response-rule precondition failed',
    );
    assert.match(
      await probe('GET'),
      /(?:^|\n)200$/,
      'Reads must remain allowed',
    );

    // Direct native control: the provider supports response + transformation.
    await sandbox.update({
      networkPolicy: {
        allow: {
          ...initialPolicy.allow,
          'example.com': [{ transform: [transformations[0].transform] }],
        },
      },
    });
    assert.equal(await probe('POST'), blocked);
    const nativeControl = sandbox.currentSession().networkPolicy;
    await sandbox.update({ networkPolicy: initialPolicy });
    await sandbox.update({
      networkPolicy: sandbox.currentSession().networkPolicy,
    });
    const nativeReadModifyWrite = await probe('POST');
    await sandbox.update({
      networkPolicy: { allow: Object.keys(initialPolicy.allow) },
    });
    const destinationPost = await probe('POST');
    assert.match(
      destinationPost,
      /MethodNotAllowedError.*\n405$/,
      'Unrestricted destination control did not return its expected response',
    );
    const observations = [];
    const failures: string[] = [];

    for (const operation of [
      'addRequestTransformations',
      'setRequestTransformations',
      'setNetworkPolicy',
      'openCodeStartup',
    ] as const) {
      // Each case starts with a fresh adapter; no external mutation of a
      // manager's already initialized private state is required.
      await sandbox.update({ networkPolicy: initialPolicy });
      const session =
        createVercelNetworkSandboxSessionFromNativeSandbox(sandbox);
      let rejected = false;
      const stopBeforeBootstrap = new Error('Stop after credential brokering');
      try {
        if (operation === 'openCodeStartup') {
          const restricted = session.restricted();
          // Use the real harness and real adapter, but stop before installing
          // OpenCode or invoking an LLM. Credential brokering happens first.
          const startupSession = new Proxy(session, {
            get(target, property) {
              if (property === 'restricted') {
                return () => ({
                  ...restricted,
                  run: async () => {
                    throw stopBeforeBootstrap;
                  },
                });
              }
              return Reflect.get(target, property, target);
            },
          });
          await createOpenCode({
            provider: 'openai',
            auth: {
              OPENAI_API_KEY: 'issue-24035-not-a-real-secret',
              OPENAI_BASE_URL: 'https://example.com/v1',
            },
            credentialForwarding: async () => 'issue-24035-placeholder',
          }).doStart({
            sessionId: 'issue-24035',
            sandboxSession: startupSession,
            sessionWorkDir: '/tmp',
          });
          throw new Error('Expected startup to stop before bootstrap');
        } else if (operation === 'setNetworkPolicy') {
          assert.ok(session.setNetworkPolicy);
          await session.setNetworkPolicy({
            mode: 'custom',
            allowedHosts: Object.keys(initialPolicy.allow),
          });
        } else {
          const mutate = session[operation];
          assert.ok(mutate);
          await mutate.call(session, transformations);
        }
      } catch (error) {
        if (HarnessCapabilityUnsupportedError.isInstance(error)) {
          rejected = true;
        } else if (error !== stopBeforeBootstrap) {
          throw error;
        }
      }
      const post = await probe('POST');
      const get = await probe('GET');
      assert.match(
        get,
        /(?:^|\n)200$/,
        'Reads must remain allowed after mutation',
      );
      observations.push({
        operation,
        rejected,
        policy: sandbox.currentSession().networkPolicy,
        post,
        get,
      });
      if (post !== blocked) {
        assert.equal(
          post,
          destinationPost,
          'Unexpected probe response; cannot attribute it to the reported bypass',
        );
        failures.push(operation);
      }
    }
    console.log(
      JSON.stringify(
        {
          initial,
          blocked,
          nativeControl,
          nativeReadModifyWrite,
          destinationPost,
          providerPolicies,
          observations,
        },
        null,
        2,
      ),
    );
    assert.equal(
      failures.length,
      0,
      `ISSUE-24035: proxy-denied registry POST reached destination after ${failures.join(', ')}`,
    );
  } finally {
    await sandbox.stop();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
