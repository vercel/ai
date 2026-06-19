import { Sandbox, SandboxStatus } from 'tensorlake';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTensorlakeSandbox } from './tensorlake-sandbox';

function fakeSandbox(overrides: Record<string, unknown> = {}) {
  return {
    sandboxId: 'sbx_1',
    name: null,
    update: vi.fn(async () => ({})),
    run: vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' })),
    suspend: vi.fn(async () => {}),
    terminate: vi.fn(async () => {}),
    resume: vi.fn(async () => {}),
    checkpoint: vi.fn(async () => ({ snapshotId: 'snap_default' })),
    info: vi.fn(async () => ({ ingressEndpoint: undefined })),
    createTunnel: vi.fn(async (remotePort: number) => ({
      remotePort,
      localHost: '127.0.0.1',
      localPort: 50000 + remotePort,
      close: vi.fn(async () => {}),
    })),
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createTensorlakeSandbox', () => {
  it('exposes the harness sandbox provider contract', () => {
    const provider = createTensorlakeSandbox({ cpus: 1 });
    expect(provider.specificationVersion).toBe('harness-sandbox-v1');
    expect(provider.providerId).toBe('tensorlake-sandbox');
  });

  describe('create-new', () => {
    it('creates a sandbox, names it per session, and advertises ports', async () => {
      const sandbox = fakeSandbox({ name: 'ai-sdk-harness-session-s1' });
      const createSpy = vi
        .spyOn(Sandbox, 'create')
        .mockResolvedValue(sandbox as unknown as Sandbox);

      const provider = createTensorlakeSandbox({ cpus: 2, ports: [3000] });
      const session = await provider.createSession({ sessionId: 's1' });

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          cpus: 2,
          name: 'ai-sdk-harness-session-s1',
          timeoutSecs: 30 * 60,
        }),
      );
      // The bridge port is advertised first (so a harness binds its bridge
      // there), followed by the caller's extra ports. Ports are reached via
      // tunnels, not the auth-gated ingress, so no update() call is made.
      expect(session.ports).toEqual([41923, 3000]);
      expect(sandbox.update).not.toHaveBeenCalled();
      expect(session.id).toBe('sbx_1');
      expect(session.defaultWorkingDirectory).toBe('/home/tl-user');
    });

    it('sanitizes the session id into a valid Tensorlake sandbox name', async () => {
      const sandbox = fakeSandbox();
      const createSpy = vi
        .spyOn(Sandbox, 'create')
        .mockResolvedValue(sandbox as unknown as Sandbox);

      // Harness ids use a mixed-case alphabet; Tensorlake names allow only
      // [a-z0-9-], so uppercase/other chars must be lowercased/replaced.
      await createTensorlakeSandbox({ cpus: 1 }).createSession({
        sessionId: '6dk6xiKWm29YjVph',
      });

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'ai-sdk-harness-session-6dk6xikwm29yjvph',
        }),
      );
    });

    it('honors a custom workingDirectory override', async () => {
      const sandbox = fakeSandbox();
      vi.spyOn(Sandbox, 'create').mockResolvedValue(
        sandbox as unknown as Sandbox,
      );

      const session = await createTensorlakeSandbox({
        cpus: 1,
        workingDirectory: '/workspace',
      }).createSession({ sessionId: 's1' });

      expect(session.defaultWorkingDirectory).toBe('/workspace');
    });

    it('runs onFirstCreate after creation when no snapshot recipe', async () => {
      const sandbox = fakeSandbox();
      vi.spyOn(Sandbox, 'create').mockResolvedValue(
        sandbox as unknown as Sandbox,
      );
      const onFirstCreate = vi.fn(async () => {});

      // identity present but no onFirstCreate -> direct create; here we pass
      // onFirstCreate but no identity, also direct.
      await createTensorlakeSandbox({ cpus: 1 }).createSession({
        onFirstCreate,
      });
      expect(onFirstCreate).toHaveBeenCalledTimes(1);
    });

    it('builds a snapshot once per identity and forks from it', async () => {
      const template = fakeSandbox({
        name: 'ai-sdk-harness-id1',
        checkpoint: vi.fn(async () => ({ snapshotId: 'snap_1' })),
      });
      const fork = fakeSandbox({ sandboxId: 'sbx_fork' });
      const createSpy = vi
        .spyOn(Sandbox, 'create')
        .mockResolvedValueOnce(template as unknown as Sandbox)
        .mockResolvedValueOnce(fork as unknown as Sandbox);
      const onFirstCreate = vi.fn(async () => {});

      const provider = createTensorlakeSandbox({ cpus: 1 });
      const session = await provider.createSession({
        sessionId: 's1',
        identity: 'id1',
        onFirstCreate,
      });

      expect(onFirstCreate).toHaveBeenCalledTimes(1);
      expect(template.checkpoint).toHaveBeenCalled();
      expect(template.terminate).toHaveBeenCalled();
      // second create is the fork from the snapshot
      expect(createSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ snapshotId: 'snap_1' }),
      );
      expect(session.id).toBe('sbx_fork');
    });

    it('forks an ephemeral (unnamed) sandbox when there is no sessionId, even if a template name is configured', async () => {
      const template = fakeSandbox({
        name: 'my-template',
        checkpoint: vi.fn(async () => ({ snapshotId: 'snap_p' })),
      });
      const fork = fakeSandbox({ sandboxId: 'sbx_fork', name: null });
      const createSpy = vi
        .spyOn(Sandbox, 'create')
        .mockResolvedValueOnce(template as unknown as Sandbox)
        .mockResolvedValueOnce(fork as unknown as Sandbox);
      const onFirstCreate = vi.fn(async () => {});

      // Prewarm shape: configured `name`, a bootstrap recipe, but no sessionId.
      const session = await createTensorlakeSandbox({
        cpus: 1,
        name: 'my-template',
      }).createSession({ identity: 'idp', onFirstCreate });

      // The template takes the configured name...
      expect(createSpy).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ name: 'my-template' }),
      );
      // ...but the fork must NOT reuse it (would collide with the template /
      // across concurrent forks). With no sessionId it is ephemeral and unnamed.
      const forkArgs = createSpy.mock.calls[1][0] as Record<string, unknown>;
      expect(forkArgs.snapshotId).toBe('snap_p');
      expect(forkArgs.name).toBeUndefined();
      expect(session.id).toBe('sbx_fork');
    });

    it('shares one bootstrap across concurrent same-identity sessions', async () => {
      const template = fakeSandbox({
        name: 'ai-sdk-harness-concurrent',
        checkpoint: vi.fn(async () => ({ snapshotId: 'snap_c' })),
      });
      const createSpy = vi
        .spyOn(Sandbox, 'create')
        .mockResolvedValueOnce(template as unknown as Sandbox)
        .mockResolvedValue(
          fakeSandbox({ sandboxId: 'sbx_fork' }) as unknown as Sandbox,
        );
      const onFirstCreate = vi.fn(async () => {});

      const provider = createTensorlakeSandbox({ cpus: 1 });
      const [a, b] = await Promise.all([
        provider.createSession({
          sessionId: 'a',
          identity: 'concurrent',
          onFirstCreate,
        }),
        provider.createSession({
          sessionId: 'b',
          identity: 'concurrent',
          onFirstCreate,
        }),
      ]);

      // The template is built, bootstrapped, and checkpointed exactly once even
      // though two sessions started concurrently and both missed the cache.
      expect(onFirstCreate).toHaveBeenCalledTimes(1);
      expect(template.checkpoint).toHaveBeenCalledTimes(1);
      // 1 template create + 1 fork per session = 3 total, both forks from the
      // shared snapshot.
      expect(createSpy).toHaveBeenCalledTimes(3);
      expect(createSpy).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ snapshotId: 'snap_c' }),
      );
      expect(createSpy).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({ snapshotId: 'snap_c' }),
      );
      expect(a.id).toBe('sbx_fork');
      expect(b.id).toBe('sbx_fork');
    });
  });

  describe('setup', () => {
    it('runs setup commands as root after create and before onFirstCreate', async () => {
      const order: string[] = [];
      const sandbox = fakeSandbox({
        run: vi.fn(async () => {
          order.push('run');
          return { exitCode: 0, stdout: '', stderr: '' };
        }),
      });
      vi.spyOn(Sandbox, 'create').mockResolvedValue(
        sandbox as unknown as Sandbox,
      );
      const onFirstCreate = vi.fn(async () => {
        order.push('onFirstCreate');
      });

      await createTensorlakeSandbox({
        cpus: 1,
        setup: ['npm install -g pnpm@10'],
      }).createSession({ onFirstCreate });

      expect(sandbox.run).toHaveBeenCalledWith('bash', {
        args: ['-c', 'npm install -g pnpm@10'],
        user: 'root',
      });
      // Setup must complete before the harness bootstrap runs.
      expect(order).toEqual(['run', 'onFirstCreate']);
    });

    it('runs multiple setup commands in order', async () => {
      const sandbox = fakeSandbox();
      vi.spyOn(Sandbox, 'create').mockResolvedValue(
        sandbox as unknown as Sandbox,
      );

      await createTensorlakeSandbox({
        cpus: 1,
        setup: ['echo one', 'echo two'],
      }).createSession({ sessionId: 's1' });

      expect(sandbox.run).toHaveBeenNthCalledWith(1, 'bash', {
        args: ['-c', 'echo one'],
        user: 'root',
      });
      expect(sandbox.run).toHaveBeenNthCalledWith(2, 'bash', {
        args: ['-c', 'echo two'],
        user: 'root',
      });
    });

    it('does not forward `setup` to Sandbox.create', async () => {
      const sandbox = fakeSandbox();
      const createSpy = vi
        .spyOn(Sandbox, 'create')
        .mockResolvedValue(sandbox as unknown as Sandbox);

      await createTensorlakeSandbox({
        cpus: 1,
        setup: ['echo hi'],
      }).createSession({ sessionId: 's1' });

      expect(createSpy.mock.calls[0][0]).not.toHaveProperty('setup');
    });

    it('throws and surfaces stderr when a setup command exits non-zero', async () => {
      const sandbox = fakeSandbox({
        run: vi.fn(async () => ({
          exitCode: 127,
          stdout: '',
          stderr: 'pnpm: not found',
        })),
      });
      vi.spyOn(Sandbox, 'create').mockResolvedValue(
        sandbox as unknown as Sandbox,
      );

      await expect(
        createTensorlakeSandbox({
          cpus: 1,
          setup: ['pnpm --version'],
        }).createSession({ sessionId: 's1' }),
      ).rejects.toThrow(/setup command failed \(exit 127\).*pnpm: not found/s);
    });

    it('runs setup on the snapshot template before the checkpoint', async () => {
      const order: string[] = [];
      const template = fakeSandbox({
        name: 'ai-sdk-harness-setup-id',
        run: vi.fn(async () => {
          order.push('run');
          return { exitCode: 0, stdout: '', stderr: '' };
        }),
        checkpoint: vi.fn(async () => {
          order.push('checkpoint');
          return { snapshotId: 'snap_1' };
        }),
      });
      const fork = fakeSandbox({ sandboxId: 'sbx_fork' });
      vi.spyOn(Sandbox, 'create')
        .mockResolvedValueOnce(template as unknown as Sandbox)
        .mockResolvedValueOnce(fork as unknown as Sandbox);

      await createTensorlakeSandbox({
        cpus: 1,
        setup: ['npm install -g pnpm@10'],
      }).createSession({
        sessionId: 's1',
        identity: 'setup-id',
        onFirstCreate: vi.fn(async () => {
          order.push('onFirstCreate');
        }),
      });

      // Baked into the snapshot: setup runs on the template, before the
      // bootstrap and the checkpoint, so every fork inherits the provisioned
      // tools. The fork itself is not re-provisioned.
      expect(template.run).toHaveBeenCalledTimes(1);
      expect(fork.run).not.toHaveBeenCalled();
      expect(order).toEqual(['run', 'onFirstCreate', 'checkpoint']);
    });

    it('does not call run when no setup is configured', async () => {
      const sandbox = fakeSandbox();
      vi.spyOn(Sandbox, 'create').mockResolvedValue(
        sandbox as unknown as Sandbox,
      );

      await createTensorlakeSandbox({ cpus: 1 }).createSession({
        sessionId: 's1',
      });

      expect(sandbox.run).not.toHaveBeenCalled();
    });
  });

  describe('session ports', () => {
    it('setPorts re-advertises with the bridge port first and deduped', async () => {
      const sandbox = fakeSandbox();
      vi.spyOn(Sandbox, 'create').mockResolvedValue(
        sandbox as unknown as Sandbox,
      );
      const session = await createTensorlakeSandbox({ cpus: 1 }).createSession({
        sessionId: 's1',
      });

      // Passing the bridge port explicitly must not duplicate it; it is always
      // advertised first regardless of where the caller lists it.
      await session.setPorts!([8080, 41923, 9090]);

      expect(session.ports).toEqual([41923, 8080, 9090]);
    });
  });

  describe('restricted', () => {
    it('returns a tool-safe session that runs commands but has no infra surface', async () => {
      const sandbox = fakeSandbox();
      vi.spyOn(Sandbox, 'create').mockResolvedValue(
        sandbox as unknown as Sandbox,
      );
      const session = await createTensorlakeSandbox({ cpus: 1 }).createSession({
        sessionId: 's1',
      });

      const restricted = session.restricted();

      // The restricted surface is the file/exec session, not the network one:
      // it can run commands but exposes none of the infra methods.
      const result = await restricted.run({ command: 'echo hi' });
      expect(result.exitCode).toBe(0);
      expect(sandbox.run).toHaveBeenCalledWith('bash', {
        args: ['-c', 'echo hi'],
      });
      expect('getPortUrl' in restricted).toBe(false);
      expect('ports' in restricted).toBe(false);
    });
  });

  describe('snapshot build failures', () => {
    it('throws when the checkpoint returns no snapshot id', async () => {
      const template = fakeSandbox({
        name: 'ai-sdk-harness-noid',
        checkpoint: vi.fn(async () => ({ snapshotId: null })),
      });
      vi.spyOn(Sandbox, 'create').mockResolvedValue(
        template as unknown as Sandbox,
      );

      await expect(
        createTensorlakeSandbox({ cpus: 1 }).createSession({
          sessionId: 's1',
          identity: 'noid',
          onFirstCreate: vi.fn(async () => {}),
        }),
      ).rejects.toThrow(/no snapshot id returned/);
    });

    it('evicts the snapshot cache on failure so a later session rebuilds', async () => {
      const failing = fakeSandbox({
        name: 'ai-sdk-harness-retry',
        checkpoint: vi.fn(async () => {
          throw new Error('checkpoint boom');
        }),
      });
      const retryTemplate = fakeSandbox({
        name: 'ai-sdk-harness-retry',
        checkpoint: vi.fn(async () => ({ snapshotId: 'snap_ok' })),
      });
      const fork = fakeSandbox({ sandboxId: 'sbx_fork' });
      const createSpy = vi
        .spyOn(Sandbox, 'create')
        .mockResolvedValueOnce(failing as unknown as Sandbox)
        .mockResolvedValueOnce(retryTemplate as unknown as Sandbox)
        .mockResolvedValueOnce(fork as unknown as Sandbox);

      const provider = createTensorlakeSandbox({ cpus: 1 });

      // First build fails inside the cached promise.
      await expect(
        provider.createSession({
          sessionId: 's1',
          identity: 'retry',
          onFirstCreate: vi.fn(async () => {}),
        }),
      ).rejects.toThrow(/checkpoint boom/);

      // The rejected promise must have been evicted: a second same-identity
      // session rebuilds the template from scratch rather than inheriting it.
      const session = await provider.createSession({
        sessionId: 's2',
        identity: 'retry',
        onFirstCreate: vi.fn(async () => {}),
      });

      expect(retryTemplate.checkpoint).toHaveBeenCalledTimes(1);
      // 1 failed template + 1 rebuilt template + 1 fork.
      expect(createSpy).toHaveBeenCalledTimes(3);
      expect(session.id).toBe('sbx_fork');
    });
  });

  describe('wrap-existing', () => {
    it('does not own the lifecycle: stop/destroy are no-ops', async () => {
      const sandbox = fakeSandbox({ name: 'shared' });
      const provider = createTensorlakeSandbox({
        sandbox: sandbox as unknown as Sandbox,
        ports: [8080],
      });

      const session = await provider.createSession();
      expect(session.ports).toEqual([41923, 8080]);

      await session.stop();
      await session.destroy?.();
      expect(sandbox.suspend).not.toHaveBeenCalled();
      expect(sandbox.terminate).not.toHaveBeenCalled();
    });
  });

  describe('lifecycle (owned)', () => {
    it('stop suspends a named sandbox', async () => {
      const sandbox = fakeSandbox({ name: 'ai-sdk-harness-session-s1' });
      vi.spyOn(Sandbox, 'create').mockResolvedValue(
        sandbox as unknown as Sandbox,
      );
      const session = await createTensorlakeSandbox({ cpus: 1 }).createSession({
        sessionId: 's1',
      });
      await session.stop();
      expect(sandbox.suspend).toHaveBeenCalled();
    });

    it('stop terminates an ephemeral (unnamed) sandbox', async () => {
      const sandbox = fakeSandbox({ name: null });
      vi.spyOn(Sandbox, 'create').mockResolvedValue(
        sandbox as unknown as Sandbox,
      );
      const session = await createTensorlakeSandbox({
        cpus: 1,
      }).createSession();
      await session.stop();
      expect(sandbox.terminate).toHaveBeenCalled();
    });
  });

  describe('getPortUrl (tunnels)', () => {
    it('opens an authenticated tunnel and returns a localhost URL', async () => {
      const sandbox = fakeSandbox();
      vi.spyOn(Sandbox, 'create').mockResolvedValue(
        sandbox as unknown as Sandbox,
      );
      const session = await createTensorlakeSandbox({ cpus: 1 }).createSession({
        sessionId: 's1',
      });

      const url = await session.getPortUrl({ port: 41923, protocol: 'ws' });

      expect(sandbox.createTunnel).toHaveBeenCalledWith(41923, {
        localPort: 0,
      });
      // 50000 + 41923 from the fake tunnel
      expect(url).toBe('ws://127.0.0.1:91923');
    });

    it('reuses one tunnel per port and closes it on destroy', async () => {
      const sandbox = fakeSandbox({ name: null });
      vi.spyOn(Sandbox, 'create').mockResolvedValue(
        sandbox as unknown as Sandbox,
      );
      const session = await createTensorlakeSandbox({
        cpus: 1,
      }).createSession();

      await session.getPortUrl({ port: 41923 });
      await session.getPortUrl({ port: 41923 });
      expect(sandbox.createTunnel).toHaveBeenCalledTimes(1);

      const tunnel = await sandbox.createTunnel.mock.results[0].value;
      await session.destroy?.();
      expect(tunnel.close).toHaveBeenCalled();
    });
  });

  describe('resumeSession', () => {
    it('finds the sandbox by deterministic name, connects, and resumes', async () => {
      vi.spyOn(Sandbox, 'list').mockResolvedValue([
        {
          sandboxId: 'sbx_old',
          name: 'ai-sdk-harness-session-s1',
          status: SandboxStatus.SUSPENDED,
          // Tensorlake's public-ingress exposure metadata — intentionally
          // different from the adapter's configured `ports`, and must not be
          // the source of advertised ports on resume.
          exposedPorts: [9999],
        },
      ] as unknown as Awaited<ReturnType<typeof Sandbox.list>>);
      const reconnected = fakeSandbox({ sandboxId: 'sbx_old' });
      const connectSpy = vi
        .spyOn(Sandbox, 'connect')
        .mockResolvedValue(reconnected as unknown as Sandbox);

      // Configured with `ports: [3000]`, so resume must advertise the same
      // ports `createSession` would — symmetric across create/resume — rather
      // than Tensorlake's `exposedPorts`.
      const provider = createTensorlakeSandbox({ cpus: 1, ports: [3000] });
      const session = await provider.resumeSession!({ sessionId: 's1' });

      expect(connectSpy).toHaveBeenCalledWith({ sandboxId: 'sbx_old' });
      expect(reconnected.resume).toHaveBeenCalled();
      expect(session.ports).toEqual([41923, 3000]);
    });

    it('stop suspends (not terminates) a resumed session whose handle name is unpopulated', async () => {
      vi.spyOn(Sandbox, 'list').mockResolvedValue([
        {
          sandboxId: 'sbx_old',
          name: 'ai-sdk-harness-session-s1',
          status: SandboxStatus.SUSPENDED,
          exposedPorts: [3000],
        },
      ] as unknown as Awaited<ReturnType<typeof Sandbox.list>>);
      // `Sandbox.connect()` returns a handle whose local `name` is null until a
      // later server round-trip backfills it, mirrored here by the default.
      const reconnected = fakeSandbox({ sandboxId: 'sbx_old', name: null });
      vi.spyOn(Sandbox, 'connect').mockResolvedValue(
        reconnected as unknown as Sandbox,
      );

      const session = await createTensorlakeSandbox({ cpus: 1 }).resumeSession!(
        {
          sessionId: 's1',
        },
      );
      await session.stop();

      // The sandbox was matched by name and is therefore resumable: stop() must
      // preserve its state rather than destroy it.
      expect(reconnected.suspend).toHaveBeenCalled();
      expect(reconnected.terminate).not.toHaveBeenCalled();
    });

    it('throws when no resumable sandbox is found', async () => {
      vi.spyOn(Sandbox, 'list').mockResolvedValue([] as never);
      await expect(
        createTensorlakeSandbox({ cpus: 1 }).resumeSession!({ sessionId: 'x' }),
      ).rejects.toThrow(/No resumable/);
    });

    it('forwards client options to list and connect', async () => {
      const listSpy = vi.spyOn(Sandbox, 'list').mockResolvedValue([
        {
          sandboxId: 'sbx_old',
          name: 'ai-sdk-harness-session-s1',
          status: SandboxStatus.SUSPENDED,
          exposedPorts: [3000],
        },
      ] as unknown as Awaited<ReturnType<typeof Sandbox.list>>);
      const reconnected = fakeSandbox({ sandboxId: 'sbx_old' });
      const connectSpy = vi
        .spyOn(Sandbox, 'connect')
        .mockResolvedValue(reconnected as unknown as Sandbox);

      const provider = createTensorlakeSandbox({
        cpus: 1,
        apiKey: 'tl_secret',
        apiUrl: 'https://api.example.test',
        organizationId: 'org_1',
        projectId: 'proj_1',
        namespace: 'team-a',
      });
      await provider.resumeSession!({ sessionId: 's1' });

      const expectedClientOptions = {
        apiKey: 'tl_secret',
        apiUrl: 'https://api.example.test',
        organizationId: 'org_1',
        projectId: 'proj_1',
        namespace: 'team-a',
      };
      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining(expectedClientOptions),
      );
      // Create-specific params (e.g. cpus) must not leak into connect; only the
      // sandbox id and client options are forwarded.
      expect(connectSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          sandboxId: 'sbx_old',
          ...expectedClientOptions,
        }),
      );
      expect(connectSpy.mock.calls[0][0]).not.toHaveProperty('cpus');
    });
  });
});
