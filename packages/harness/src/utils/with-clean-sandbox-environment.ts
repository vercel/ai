import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';

/**
 * Secure startup for POSIX runtimes. Infrastructure commands use a known,
 * non-login shell with a replacement environment; agent runtimes may instead
 * call spawnDirect themselves. No shell-based fallback is possible.
 */
export function withCleanSandboxEnvironment<T extends SandboxSession>(session: T): T {
  if (session.spawnDirect == null) {
    throw new Error('This harness requires sandbox.spawnDirect with replacement-environment semantics before bootstrap.');
  }
  const spawn: SandboxSession['spawn'] = options => session.spawnDirect!({
    executable: '/bin/sh', args: ['-c', options.command],
    workingDirectory: options.workingDirectory,
    env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/nonexistent', ...options.env },
    abortSignal: options.abortSignal,
  });
  const run: SandboxSession['run'] = async options => {
    const process = await spawn(options);
    const [stdout, stderr, result] = await Promise.all([
      new Response(process.stdout).text(), new Response(process.stderr).text(), process.wait(),
    ]);
    return { ...result, stdout, stderr };
  };
  return new Proxy(session, {
    get(target, property) {
      if (property === 'run') return run;
      if (property === 'spawn') return spawn;
      const value = Reflect.get(target, property, target);
      if (property === 'restricted' && typeof value === 'function') {
        return () => withCleanSandboxEnvironment(value.call(target));
      }
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
