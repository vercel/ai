import { HarnessSandboxAuthenticationError } from '@ai-sdk/harness';
import type { Image, ModalClient, Sandbox } from 'modal';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createModalNetworkSandboxSession,
  createModalNetworkSandboxSessionFromNativeSandbox,
  createModalSandboxSessionFromNativeSandbox,
  resumeModalNetworkSandboxSession,
} from './modal-sandbox';

const ALLOW_ALL = {
  outboundCidrAllowlist: ['0.0.0.0/0'],
  outboundDomainAllowlist: ['*'],
};

describe('new Modal sandbox sessions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('adapts basic and network sessions with explicit native lifecycle', async () => {
    const { sandbox, spies } = makeMockSandbox();
    const nativeSandbox = {
      sandbox,
      workdir: '/app',
      encryptedPorts: [4000],
    };
    const basic = createModalSandboxSessionFromNativeSandbox(nativeSandbox);
    expect('stop' in basic).toBe(false);
    expect(basic.description).toContain('/app');
    const adapted =
      createModalNetworkSandboxSessionFromNativeSandbox(nativeSandbox);
    expect(adapted.id).toBe('sb-harness');
    expect(adapted.defaultWorkingDirectory).toBe('/app');
    expect(adapted.ports).toEqual([4000]);
    await adapted.stop();
    await adapted.destroy();
    expect(spies.terminate).toHaveBeenCalledOnce();
    expect(ModalClientMock).not.toHaveBeenCalled();
  });

  it('rejects native sandbox inputs', async () => {
    await expect(
      createModalNetworkSandboxSession({
        sandbox: makeMockSandbox().sandbox,
      } as never),
    ).rejects.toThrow('FromNativeSandbox');
  });

  it('rejects HTTP/2 tunnels', async () => {
    await expect(
      createModalNetworkSandboxSession({ h2Ports: [4000] } as never),
    ).rejects.toThrow('h2Ports is not supported');
    expect(ModalClientMock).not.toHaveBeenCalled();
  });

  it('creates a sandbox with the default App, image, and timeout', async () => {
    const { client, spies, app } = makeMockClient();
    useDefaultClient(client);
    const { sandbox } = makeMockSandbox({ workingDirectory: '/workspace' });
    spies.create.mockResolvedValue(sandbox);

    const session = await createModalNetworkSandboxSession();

    expect(spies.appFromName).toHaveBeenCalledWith('ai-sdk-sandbox', {
      createIfMissing: true,
    });
    expect(spies.fromRegistry).toHaveBeenCalledWith('node:24');
    const [createdApp, image, params] = spies.create.mock.calls[0];
    expect(createdApp).toBe(app);
    expect(image.commands).toEqual([
      'RUN npm install --global pnpm@11',
      'WORKDIR /workspace',
    ]);
    expect(params).toEqual({ timeoutMs: 30 * 60 * 1_000, ...ALLOW_ALL });
    expect(session.id).toBe('sb-harness');
    expect(session.defaultWorkingDirectory).toBe('/workspace');
    expect(session.ports).toEqual([]);
  });

  it('forwards the client, App name, image, and native options', async () => {
    const { client, spies } = makeMockClient();
    const { sandbox, spies: sandboxSpies } = makeMockSandbox();
    spies.create.mockResolvedValue(sandbox);

    const session = await createModalNetworkSandboxSession({
      client,
      appName: 'my-app',
      image: 'python:3.13',
      encryptedPorts: [8080, 4000],
      workdir: '/app',
      timeoutMs: 60_000,
      cpu: 0.5,
    });

    expect(ModalClientMock).not.toHaveBeenCalled();
    expect(spies.appFromName).toHaveBeenCalledWith('my-app', {
      createIfMissing: true,
    });
    expect(spies.fromRegistry).toHaveBeenCalledWith('python:3.13');
    const [, image, params] = spies.create.mock.calls[0];
    expect(image.commands).toEqual([]);
    expect(params).toEqual({
      encryptedPorts: [8080, 4000],
      workdir: '/app',
      timeoutMs: 60_000,
      cpu: 0.5,
      ...ALLOW_ALL,
    });
    expect(session.ports).toEqual([4000, 8080]);
    expect(session.defaultWorkingDirectory).toBe('/app');
    expect(sandboxSpies.exec).not.toHaveBeenCalled();
  });

  it('uses a Modal image as provided', async () => {
    const { client, spies } = makeMockClient();
    spies.create.mockResolvedValue(makeMockSandbox().sandbox);
    const image = makeMockImage({ tag: 'custom' });

    await createModalNetworkSandboxSession({ client, image });

    expect(spies.create.mock.calls[0][1]).toBe(image);
    expect(spies.fromRegistry).not.toHaveBeenCalled();
  });

  it('creates a newly named sandbox without looking up that ID', async () => {
    const { client, spies } = makeMockClient();
    spies.create.mockResolvedValue(makeMockSandbox().sandbox);

    const session = await createModalNetworkSandboxSession({
      client,
      sandboxId: 'live-session',
    });

    expect(session.id).toBe('live-session');
    expect(spies.create.mock.calls[0][2]).toEqual(
      expect.objectContaining({ name: 'live-session' }),
    );
    expect(spies.sandboxFromName).not.toHaveBeenCalled();
    expect(spies.sandboxFromId).not.toHaveBeenCalled();
  });

  it('surfaces native duplicate-name failures without a preflight lookup', async () => {
    const { client, spies } = makeMockClient();
    const conflict = makeModalError('AlreadyExistsError');
    spies.create.mockRejectedValueOnce(conflict);

    await expect(
      createModalNetworkSandboxSession({ client, sandboxId: 'already-exists' }),
    ).rejects.toBe(conflict);
    expect(spies.sandboxFromName).not.toHaveBeenCalled();
  });

  it('terminates the new sandbox when its setup fails', async () => {
    const { client, spies } = makeMockClient();
    const { sandbox, spies: sandboxSpies } = makeMockSandbox({
      workingDirectoryExitCode: 127,
    });
    spies.create.mockResolvedValue(sandbox);

    await expect(createModalNetworkSandboxSession({ client })).rejects.toThrow(
      'Failed to resolve the Modal sandbox working directory',
    );
    expect(sandboxSpies.terminate).toHaveBeenCalledOnce();
  });

  it('respects an aborted signal before and after the sandbox starts', async () => {
    const { client, spies } = makeMockClient();
    const aborted = new AbortController();
    aborted.abort();

    await expect(
      createModalNetworkSandboxSession({
        client,
        abortSignal: aborted.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(spies.appFromName).not.toHaveBeenCalled();

    const controller = new AbortController();
    const { sandbox, spies: sandboxSpies } = makeMockSandbox();
    spies.create.mockImplementation(async () => {
      controller.abort();
      return sandbox;
    });
    await expect(
      createModalNetworkSandboxSession({
        client,
        abortSignal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(sandboxSpies.terminate).toHaveBeenCalledOnce();
  });

  it('reports missing and rejected credentials as authentication errors', async () => {
    const missing = new Error(
      'Profile is missing credentials. Please set them in .modal.toml, as environment variables, or via the ModalClient constructor.',
    );
    const rejected = Object.assign(new Error('unauthenticated'), { code: 16 });
    for (const failure of [missing, rejected]) {
      const { client, spies } = makeMockClient();
      spies.appFromName.mockRejectedValueOnce(failure);

      const error = await createModalNetworkSandboxSession({ client }).catch(
        error => error,
      );

      expect(HarnessSandboxAuthenticationError.isInstance(error)).toBe(true);
      expect(error.sandboxProviderId).toBe('modal-sandbox');
      expect(error.cause).toBe(failure);
    }
  });

  it('keeps the caller network settings instead of the allow-all defaults', async () => {
    const { client, spies } = makeMockClient();
    spies.create.mockImplementation(async () => makeMockSandbox().sandbox);

    await createModalNetworkSandboxSession({ client, blockNetwork: true });
    await createModalNetworkSandboxSession({
      client,
      outboundDomainAllowlist: ['example.com'],
    });
    await createModalNetworkSandboxSession({
      client,
      outboundCidrAllowlist: ['10.0.0.0/8'],
    });

    expect(spies.create.mock.calls.map(call => call[2])).toEqual([
      { timeoutMs: 30 * 60 * 1_000, blockNetwork: true },
      { timeoutMs: 30 * 60 * 1_000, outboundDomainAllowlist: ['example.com'] },
      { timeoutMs: 30 * 60 * 1_000, outboundCidrAllowlist: ['10.0.0.0/8'] },
    ]);
  });

  it('prepares a template once and starts sandboxes from its image', async () => {
    const { client, spies } = makeMockClient();
    const templateSandbox = makeMockSandbox({ workingDirectory: '/workspace' });
    const templateImage = makeMockImage({ imageId: 'im-template' });
    templateSandbox.spies.snapshotFilesystem.mockResolvedValue(templateImage);
    const liveSandbox = makeMockSandbox({ workingDirectory: '/workspace' });
    spies.imageFromName
      .mockRejectedValueOnce(makeModalError('NotFoundError'))
      .mockResolvedValue(templateImage);
    spies.create
      .mockResolvedValueOnce(templateSandbox.sandbox)
      .mockResolvedValue(liveSandbox.sandbox);
    const prepare = vi.fn(async () => {});
    const create = () =>
      createModalNetworkSandboxSession({
        client,
        sandboxId: 'live-name',
        encryptedPorts: [4000],
        template: { identity: 'recipe-one', prepare },
      });

    await create();
    await create();

    expect(prepare).toHaveBeenCalledOnce();
    const [{ session }] = prepare.mock.calls[0] as unknown as [
      { session: { description: string } },
    ];
    expect(session.description).toContain('/workspace');
    expect('stop' in session).toBe(false);
    expect(templateImage.publish).toHaveBeenCalledOnce();
    expect(templateSandbox.spies.terminate).toHaveBeenCalledOnce();

    const calls = spies.create.mock.calls;
    expect(calls).toHaveLength(3);
    expect(calls[0][2]).toEqual({ timeoutMs: 30 * 60 * 1_000, ...ALLOW_ALL });
    for (const call of calls.slice(1)) {
      expect(call[1]).toBe(templateImage);
      expect(call[2]).toEqual({
        encryptedPorts: [4000],
        name: 'live-name',
        timeoutMs: 30 * 60 * 1_000,
        ...ALLOW_ALL,
      });
    }
  });
});

describe('resumed Modal sandbox sessions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('reattaches to a named sandbox without creating one', async () => {
    const { client, spies } = makeMockClient();
    useDefaultClient(client);
    const { sandbox, spies: sandboxSpies } = makeMockSandbox({
      workingDirectory: '/app',
      tunnels: {
        8080: { url: 'https://b.modal.host' },
        4000: { url: 'https://a.modal.host' },
        5432: { url: 'https://c.modal.host', unencryptedHost: 'r.modal.host' },
      },
    });
    spies.sandboxFromName.mockResolvedValue(sandbox);

    const session = await resumeModalNetworkSandboxSession({
      sandboxId: 'live-session',
    });

    expect(spies.sandboxFromName).toHaveBeenCalledWith(
      'ai-sdk-sandbox',
      'live-session',
    );
    expect(spies.sandboxFromId).not.toHaveBeenCalled();
    expect(spies.create).not.toHaveBeenCalled();
    expect(session.id).toBe('live-session');
    expect(session.defaultWorkingDirectory).toBe('/app');
    expect(session.ports).toEqual([4000, 8080]);
    expect(
      await session.getPortEndpoint({ port: 4000, protocol: 'ws' }),
    ).toEqual({ url: 'wss://a.modal.host/' });
    await session.destroy();
    expect(sandboxSpies.terminate).toHaveBeenCalledOnce();
  });

  it('falls back to the Modal sandbox ID when no sandbox has that name', async () => {
    const { client, spies } = makeMockClient();
    const { sandbox } = makeMockSandbox();
    spies.sandboxFromName.mockRejectedValue(makeModalError('NotFoundError'));
    spies.sandboxFromId.mockResolvedValue(sandbox);

    const session = await resumeModalNetworkSandboxSession({
      client,
      appName: 'my-app',
      sandboxId: 'sb-harness',
    });

    expect(spies.sandboxFromName).toHaveBeenCalledWith('my-app', 'sb-harness');
    expect(spies.sandboxFromId).toHaveBeenCalledWith('sb-harness');
    expect(session.id).toBe('sb-harness');
  });

  it('rejects terminated sandboxes', async () => {
    const { client, spies } = makeMockClient();
    const { sandbox, spies: sandboxSpies } = makeMockSandbox({ exitCode: 137 });
    spies.sandboxFromName.mockResolvedValue(sandbox);

    await expect(
      resumeModalNetworkSandboxSession({ client, sandboxId: 'finished' }),
    ).rejects.toThrow(
      'Modal sandbox "finished" has terminated and cannot be resumed.',
    );
    expect(sandboxSpies.terminate).not.toHaveBeenCalled();
    expect(spies.create).not.toHaveBeenCalled();
  });

  it('rejects sandboxes that terminated but still poll as running', async () => {
    const { client, spies } = makeMockClient();
    const { sandbox, spies: sandboxSpies } = makeMockSandbox();
    const finished = Object.assign(
      new Error(
        '/modal.client.ModalClient/SandboxGetTunnels FAILED_PRECONDITION: Sandbox has already finished with status terminated',
      ),
      { code: 9 },
    );
    sandboxSpies.tunnels.mockRejectedValue(finished);
    spies.sandboxFromName.mockResolvedValue(sandbox);

    const error = await resumeModalNetworkSandboxSession({
      client,
      sandboxId: 'finished',
    }).catch(error => error);

    expect(error.message).toBe(
      'Modal sandbox "finished" has terminated and cannot be resumed.',
    );
    expect(error.cause).toBe(finished);
    expect(sandboxSpies.poll).toHaveBeenCalledOnce();
    expect(sandboxSpies.detach).toHaveBeenCalledOnce();
    expect(sandboxSpies.terminate).not.toHaveBeenCalled();
  });

  it('rejects sandboxes whose liveness check reports them finished', async () => {
    const { client, spies } = makeMockClient();
    const { sandbox, spies: sandboxSpies } = makeMockSandbox();
    const finished = Object.assign(new Error('failed precondition'), {
      code: 9,
    });
    sandboxSpies.poll.mockRejectedValue(finished);
    spies.sandboxFromName.mockResolvedValue(sandbox);

    const error = await resumeModalNetworkSandboxSession({
      client,
      sandboxId: 'finished',
    }).catch(error => error);

    expect(error.message).toBe(
      'Modal sandbox "finished" has terminated and cannot be resumed.',
    );
    expect(error.cause).toBe(finished);
    expect(sandboxSpies.detach).toHaveBeenCalledOnce();
    expect(sandboxSpies.terminate).not.toHaveBeenCalled();
  });

  it('surfaces other failures while reattaching unchanged', async () => {
    const { client, spies } = makeMockClient();
    const unavailable = Object.assign(new Error('unavailable'), { code: 14 });
    const { sandbox, spies: sandboxSpies } = makeMockSandbox();
    sandboxSpies.tunnels.mockRejectedValue(unavailable);
    spies.sandboxFromName.mockResolvedValue(sandbox);

    await expect(
      resumeModalNetworkSandboxSession({ client, sandboxId: 'live-session' }),
    ).rejects.toBe(unavailable);
    expect(sandboxSpies.detach).toHaveBeenCalledOnce();
    expect(sandboxSpies.terminate).not.toHaveBeenCalled();
  });

  it('rejects missing sandboxes and respects an aborted signal', async () => {
    const { client, spies } = makeMockClient();
    const notFound = makeModalError('NotFoundError');
    const { sandbox } = makeMockSandbox();
    vi.mocked(sandbox.poll).mockRejectedValue(
      Object.assign(new Error('not found'), { code: 5 }),
    );
    spies.sandboxFromName.mockRejectedValue(notFound);
    spies.sandboxFromId.mockResolvedValue(sandbox);

    await expect(
      resumeModalNetworkSandboxSession({ client, sandboxId: 'missing' }),
    ).rejects.toBe(notFound);
    expect(spies.create).not.toHaveBeenCalled();

    const controller = new AbortController();
    controller.abort();
    await expect(
      resumeModalNetworkSandboxSession({
        client,
        sandboxId: 'missing',
        abortSignal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(spies.sandboxFromName).toHaveBeenCalledTimes(1);
  });

  it('surfaces lookup failures that are not a missing sandbox', async () => {
    const { client, spies } = makeMockClient();
    const unavailable = Object.assign(new Error('unavailable'), { code: 14 });
    const { sandbox } = makeMockSandbox();
    vi.mocked(sandbox.poll).mockRejectedValue(unavailable);
    spies.sandboxFromName.mockRejectedValue(makeModalError('NotFoundError'));
    spies.sandboxFromId.mockResolvedValue(sandbox);

    await expect(
      resumeModalNetworkSandboxSession({ client, sandboxId: 'sb-harness' }),
    ).rejects.toBe(unavailable);
  });

  it('reports rejected credentials as authentication errors', async () => {
    const { client, spies } = makeMockClient();
    spies.sandboxFromName.mockRejectedValue(
      Object.assign(new Error('unauthenticated'), { code: 16 }),
    );

    const error = await resumeModalNetworkSandboxSession({
      client,
      sandboxId: 'live-session',
    }).catch(error => error);

    expect(HarnessSandboxAuthenticationError.isInstance(error)).toBe(true);
  });
});

describe('stopped Modal sandbox sessions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('restores a stopped sandbox from its stop snapshot under the same ID', async () => {
    const { client, spies, app, snapshot } = makeStoppedFixture();
    const restored = makeMockSandbox({ workingDirectory: '/workspace' });
    spies.create.mockResolvedValue(restored.sandbox);

    const session = await resumeModalNetworkSandboxSession({
      client,
      appName: 'my-app',
      sandboxId: 'live-session',
      encryptedPorts: [4000],
      cpu: 0.5,
      blockNetwork: false,
    });

    expect(spies.imageFromName).toHaveBeenCalledWith(
      expect.stringMatching(/^ai-sdk-sandbox-stopped-[a-f0-9]{24}$/),
    );
    expect(spies.imageFromId).toHaveBeenCalledWith('im-stopped');
    expect(spies.appFromName).toHaveBeenCalledWith('my-app', {
      createIfMissing: true,
    });
    expect(spies.create).toHaveBeenCalledExactlyOnceWith(app, snapshot, {
      encryptedPorts: [4000],
      cpu: 0.5,
      blockNetwork: false,
      timeoutMs: 30 * 60 * 1_000,
      ...ALLOW_ALL,
      name: 'live-session',
    });
    expect(session.id).toBe('live-session');
    expect(session.defaultWorkingDirectory).toBe('/workspace');
    expect(session.ports).toEqual([4000]);
  });

  it('restores a sandbox that terminated after it was stopped', async () => {
    const { client, spies } = makeStoppedFixture();
    spies.sandboxFromName.mockResolvedValue(
      makeMockSandbox({ exitCode: 137 }).sandbox,
    );
    spies.create.mockResolvedValue(makeMockSandbox().sandbox);

    const session = await resumeModalNetworkSandboxSession({
      client,
      sandboxId: 'live-session',
      blockNetwork: true,
    });

    expect(spies.create).toHaveBeenCalledOnce();
    expect(session.id).toBe('live-session');
    expect(session.ports).toEqual([]);
  });

  it('retries while the name of the stopped sandbox is still reserved', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { client, spies } = makeStoppedFixture();
    spies.create
      .mockRejectedValueOnce(makeModalError('AlreadyExistsError'))
      .mockRejectedValueOnce(makeModalError('AlreadyExistsError'))
      .mockResolvedValue(makeMockSandbox().sandbox);

    const resumed = resumeModalNetworkSandboxSession({
      client,
      sandboxId: 'live-session',
      blockNetwork: true,
    });
    while (spies.create.mock.calls.length < 3) {
      await vi.advanceTimersByTimeAsync(500);
      await new Promise(resolve => setImmediate(resolve));
    }

    expect((await resumed).id).toBe('live-session');
    expect(spies.create).toHaveBeenCalledTimes(3);
  });

  it('reattaches when another caller restored the sandbox first', async () => {
    const { client, spies } = makeStoppedFixture();
    const running = makeMockSandbox({
      tunnels: { 4000: { url: 'https://a.modal.host' } },
    });
    spies.sandboxFromName
      .mockRejectedValueOnce(makeModalError('NotFoundError'))
      .mockResolvedValue(running.sandbox);
    spies.create.mockRejectedValue(makeModalError('AlreadyExistsError'));

    const session = await resumeModalNetworkSandboxSession({
      client,
      sandboxId: 'live-session',
      blockNetwork: true,
    });

    expect(spies.create).toHaveBeenCalledOnce();
    expect(session.ports).toEqual([4000]);
  });

  it('rejects a stopped sandbox whose snapshot no longer exists', async () => {
    const { client, spies } = makeStoppedFixture();
    const notFound = makeModalError('NotFoundError');
    spies.sandboxFromName.mockRejectedValue(notFound);
    spies.imageFromId.mockRejectedValue(makeModalError('NotFoundError'));

    await expect(
      resumeModalNetworkSandboxSession({ client, sandboxId: 'live-session' }),
    ).rejects.toBe(notFound);
    expect(spies.create).not.toHaveBeenCalled();
  });

  it('terminates a restored sandbox whose snapshot turns out to be gone', async () => {
    const { client, spies } = makeStoppedFixture();
    const expired = makeModalError('NotFoundError');
    const restored = makeMockSandbox();
    restored.spies.exec.mockRejectedValue(expired);
    spies.create.mockResolvedValue(restored.sandbox);

    const error = await resumeModalNetworkSandboxSession({
      client,
      sandboxId: 'live-session',
      blockNetwork: true,
    }).catch(error => error);

    expect(error.message).toBe(
      'Modal sandbox "live-session" has terminated and cannot be resumed.',
    );
    expect(error.cause).toBe(expired);
    expect(restored.spies.terminate).toHaveBeenCalledOnce();
  });

  it('surfaces failures to start the restored sandbox', async () => {
    const { client, spies } = makeStoppedFixture();
    const failure = Object.assign(new Error('unavailable'), { code: 14 });
    spies.create.mockRejectedValue(failure);

    await expect(
      resumeModalNetworkSandboxSession({
        client,
        sandboxId: 'live-session',
        blockNetwork: true,
      }),
    ).rejects.toBe(failure);
    expect(spies.create).toHaveBeenCalledOnce();
  });

  it.each([
    {
      title: 'created with blockNetwork',
      creation: { blockNetwork: true },
    },
    {
      title: 'created with an outbound allowlist',
      creation: { outboundDomainAllowlist: ['example.com'] },
    },
    {
      title: 'restricted with setNetworkPolicy() after creation',
      creation: {},
      policy: { mode: 'deny-all' as const },
    },
  ])(
    'refuses to restore a sandbox $title without network settings',
    async ({ creation, policy }) => {
      const { client, spies } = makeMockClient();
      const created = makeMockSandbox();
      const snapshot = makeMockImage({ imageId: 'im-stopped' });
      created.spies.snapshotFilesystem.mockResolvedValue(snapshot);
      spies.create.mockResolvedValue(created.sandbox);
      const session = await createModalNetworkSandboxSession({
        client,
        sandboxId: 'live-session',
        ...creation,
      });
      if (policy != null) await session.setNetworkPolicy?.(policy);
      await session.stop();
      expect(snapshot.publish).toHaveBeenCalledOnce();

      spies.create.mockClear();
      spies.sandboxFromName.mockRejectedValue(makeModalError('NotFoundError'));
      const missing = makeMockSandbox();
      missing.spies.poll.mockRejectedValue(
        Object.assign(new Error('not found'), { code: 5 }),
      );
      spies.sandboxFromId.mockResolvedValue(missing.sandbox);
      spies.imageFromName.mockResolvedValue(snapshot);
      spies.imageFromId.mockResolvedValue(snapshot);

      await expect(
        resumeModalNetworkSandboxSession({
          client,
          sandboxId: 'live-session',
          encryptedPorts: [4000],
        }),
      ).rejects.toThrow(
        'resumeModalNetworkSandboxSession: Modal sandbox "live-session" is stopped and has to be restored from its stop snapshot. Modal does not keep the network settings of a stopped sandbox, so pass blockNetwork or the outbound allowlists again, or blockNetwork: false to restore it with open outbound access.',
      );
      expect(spies.create).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      title: 'blockNetwork: true',
      network: { blockNetwork: true },
      expected: { blockNetwork: true },
    },
    {
      title: 'outbound allowlists',
      network: {
        outboundDomainAllowlist: ['example.com'],
        outboundCidrAllowlist: [],
      },
      expected: {
        outboundDomainAllowlist: ['example.com'],
        outboundCidrAllowlist: [],
      },
    },
    {
      title: 'a single outbound allowlist',
      network: { outboundCidrAllowlist: ['10.0.0.0/8'] },
      expected: { outboundCidrAllowlist: ['10.0.0.0/8'] },
    },
    {
      title: 'blockNetwork: false',
      network: { blockNetwork: false },
      expected: { blockNetwork: false, ...ALLOW_ALL },
    },
  ])(
    'restores a stopped sandbox with $title',
    async ({ network, expected }) => {
      const { client, spies, app, snapshot } = makeStoppedFixture();
      spies.create.mockResolvedValue(makeMockSandbox().sandbox);

      await resumeModalNetworkSandboxSession({
        client,
        sandboxId: 'live-session',
        ...network,
      });

      expect(spies.create).toHaveBeenCalledExactlyOnceWith(app, snapshot, {
        timeoutMs: 30 * 60 * 1_000,
        ...expected,
        name: 'live-session',
      });
    },
  );

  it('reattaches to a running sandbox without network settings', async () => {
    const { client, spies } = makeStoppedFixture();
    spies.sandboxFromName.mockResolvedValue(
      makeMockSandbox({ tunnels: { 4000: { url: 'https://a.modal.host' } } })
        .sandbox,
    );

    const session = await resumeModalNetworkSandboxSession({
      client,
      sandboxId: 'live-session',
    });

    expect(session.ports).toEqual([4000]);
    expect(spies.imageFromName).not.toHaveBeenCalled();
    expect(spies.create).not.toHaveBeenCalled();
  });

  it('rejects HTTP/2 tunnels', async () => {
    await expect(
      resumeModalNetworkSandboxSession({
        sandboxId: 'live-session',
        h2Ports: [4000],
      } as never),
    ).rejects.toThrow('h2Ports is not supported');
    expect(ModalClientMock).not.toHaveBeenCalled();
  });

  it('publishes a stop snapshot on stop() and deletes it on destroy()', async () => {
    const { client, spies } = makeMockClient();
    const created = makeMockSandbox();
    const snapshot = makeMockImage({ imageId: 'im-stopped' });
    created.spies.snapshotFilesystem.mockResolvedValue(snapshot);
    spies.create.mockResolvedValue(created.sandbox);
    spies.imageFromName.mockResolvedValue(snapshot);

    const session = await createModalNetworkSandboxSession({
      client,
      sandboxId: 'live-session',
    });
    await session.stop();

    expect(snapshot.publish).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(/^ai-sdk-sandbox-stopped-[a-f0-9]{24}$/),
    );
    expect(created.spies.terminate).toHaveBeenCalledOnce();
    expect(spies.imageDelete).not.toHaveBeenCalled();

    await session.destroy();

    expect(spies.imageFromName).toHaveBeenCalledWith(
      snapshot.publish.mock.calls[0][0],
    );
    expect(spies.imageDelete).toHaveBeenCalledExactlyOnceWith('im-stopped');
    expect(created.spies.terminate).toHaveBeenCalledOnce();
  });
});

describe('Modal sandbox sessions with request transformations', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const TRANSFORMING = {
    tags: { 'ai-sdk-request-transformations': 'true' },
    experimentalOutboundPolicy: expect.any(MockOutboundPolicy),
  };

  it('creates the sandbox with an empty outbound policy only when asked', async () => {
    const { client, spies } = makeMockClient();
    spies.create.mockImplementation(async () => makeMockSandbox().sandbox);

    const plain = await createModalNetworkSandboxSession({ client });
    const transforming = await createModalNetworkSandboxSession({
      client,
      requestTransformations: true,
      encryptedPorts: [4000],
      tags: { team: 'ai' },
    });

    expect(spies.create.mock.calls.map(call => call[2])).toEqual([
      { timeoutMs: 30 * 60 * 1_000, ...ALLOW_ALL },
      {
        timeoutMs: 30 * 60 * 1_000,
        encryptedPorts: [4000],
        tags: { team: 'ai', 'ai-sdk-request-transformations': 'true' },
        experimentalOutboundPolicy: expect.any(MockOutboundPolicy),
      },
    ]);
    expect(
      spies.create.mock.calls[1][2].experimentalOutboundPolicy.replacements,
    ).toEqual([]);
    expect('addRequestTransformations' in plain).toBe(false);
    expect('setRequestTransformations' in plain).toBe(false);
    expect(transforming.addRequestTransformations).toBeTypeOf('function');
    expect(transforming.setRequestTransformations).toBeTypeOf('function');
  });

  it('replaces the outbound policy of the created sandbox', async () => {
    const { client, spies } = makeMockClient();
    const created = makeMockSandbox();
    spies.create.mockResolvedValue(created.sandbox);

    const session = await createModalNetworkSandboxSession({
      client,
      requestTransformations: true,
    });
    await session.addRequestTransformations?.([
      {
        match: { host: 'api.example.com' },
        transform: { headers: { 'x-api-key': 'real' } },
      },
    ]);

    expect(
      created.spies.experimentalUpdateOutboundPolicy.mock.calls[0][0]
        .replacements,
    ).toEqual([
      { domain: 'api.example.com', headers: { 'x-api-key': 'real' } },
    ]);
  });

  it('prepares a template without the outbound policy', async () => {
    const { client, spies } = makeMockClient();
    const templateSandbox = makeMockSandbox();
    templateSandbox.spies.snapshotFilesystem.mockResolvedValue(
      makeMockImage({ imageId: 'im-template' }),
    );
    spies.create
      .mockResolvedValueOnce(templateSandbox.sandbox)
      .mockResolvedValue(makeMockSandbox().sandbox);

    await createModalNetworkSandboxSession({
      client,
      requestTransformations: true,
      template: { identity: 'recipe-one', prepare: async () => {} },
    });

    expect(spies.create.mock.calls.map(call => call[2])).toEqual([
      { timeoutMs: 30 * 60 * 1_000, ...ALLOW_ALL },
      { timeoutMs: 30 * 60 * 1_000, ...TRANSFORMING },
    ]);
  });

  it.each([
    { blockNetwork: true },
    { outboundCidrAllowlist: ['10.0.0.0/8'] },
    { outboundDomainAllowlist: ['example.com'] },
  ])('refuses to combine request transformations with %o', async network => {
    const { client, spies } = makeMockClient();

    await expect(
      createModalNetworkSandboxSession({
        client,
        requestTransformations: true,
        ...network,
      }),
    ).rejects.toThrow(
      'createModalNetworkSandboxSession: requestTransformations cannot be combined with blockNetwork, outboundCidrAllowlist, or outboundDomainAllowlist.',
    );
    await expect(
      resumeModalNetworkSandboxSession({
        client,
        sandboxId: 'live-session',
        requestTransformations: true,
        ...network,
      }),
    ).rejects.toThrow(
      'resumeModalNetworkSandboxSession: requestTransformations cannot be combined with blockNetwork, outboundCidrAllowlist, or outboundDomainAllowlist.',
    );
    expect(spies.appFromName).not.toHaveBeenCalled();
    expect(spies.sandboxFromName).not.toHaveBeenCalled();
  });

  it('rejects an outbound policy of the caller', async () => {
    const experimentalOutboundPolicy = new MockOutboundPolicy();

    await expect(
      createModalNetworkSandboxSession({ experimentalOutboundPolicy } as never),
    ).rejects.toThrow(
      'createModalNetworkSandboxSession: experimentalOutboundPolicy is not supported. Pass requestTransformations: true and set the rules on the session.',
    );
    await expect(
      resumeModalNetworkSandboxSession({
        sandboxId: 'live-session',
        experimentalOutboundPolicy,
      } as never),
    ).rejects.toThrow(
      'resumeModalNetworkSandboxSession: experimentalOutboundPolicy is not supported.',
    );
    expect(ModalClientMock).not.toHaveBeenCalled();
  });

  it('keeps request transformations off adapted native sandboxes', () => {
    const adapted = createModalNetworkSandboxSessionFromNativeSandbox({
      sandbox: makeMockSandbox({
        tags: { 'ai-sdk-request-transformations': 'true' },
      }).sandbox,
      workdir: '/app',
    });

    expect('addRequestTransformations' in adapted).toBe(false);
    expect('setRequestTransformations' in adapted).toBe(false);
  });

  it('reattaches with request transformations only to a sandbox that was created with them', async () => {
    const { client, spies } = makeMockClient();
    spies.sandboxFromName
      .mockResolvedValueOnce(
        makeMockSandbox({ tags: { 'ai-sdk-request-transformations': 'true' } })
          .sandbox,
      )
      .mockResolvedValueOnce(makeMockSandbox({ tags: { team: 'ai' } }).sandbox);

    const transforming = await resumeModalNetworkSandboxSession({
      client,
      sandboxId: 'live-session',
    });
    const plain = await resumeModalNetworkSandboxSession({
      client,
      sandboxId: 'live-session',
    });

    expect(transforming.addRequestTransformations).toBeTypeOf('function');
    expect(transforming.setRequestTransformations).toBeTypeOf('function');
    expect('addRequestTransformations' in plain).toBe(false);
    expect('setRequestTransformations' in plain).toBe(false);
    expect(spies.create).not.toHaveBeenCalled();
  });

  it('refuses request transformations on a running sandbox that was created without them', async () => {
    const { client, spies } = makeMockClient();
    const running = makeMockSandbox({ tags: { team: 'ai' } });
    spies.sandboxFromName.mockResolvedValue(running.sandbox);

    await expect(
      resumeModalNetworkSandboxSession({
        client,
        sandboxId: 'live-session',
        requestTransformations: true,
        blockNetwork: false,
      }),
    ).rejects.toThrow(
      'resumeModalNetworkSandboxSession: Modal sandbox "live-session" is running and was not created with requestTransformations: true, so it cannot broker credentials. Resume it without requestTransformations, or create a new sandbox with it.',
    );
    expect(running.spies.detach).toHaveBeenCalledOnce();
    expect(running.spies.terminate).not.toHaveBeenCalled();
    expect(spies.create).not.toHaveBeenCalled();
  });

  it('refuses request transformations when another caller restored the sandbox without them', async () => {
    const { client, spies } = makeStoppedFixture();
    const running = makeMockSandbox();
    spies.sandboxFromName
      .mockRejectedValueOnce(makeModalError('NotFoundError'))
      .mockResolvedValue(running.sandbox);
    spies.create.mockRejectedValue(makeModalError('AlreadyExistsError'));

    await expect(
      resumeModalNetworkSandboxSession({
        client,
        sandboxId: 'live-session',
        requestTransformations: true,
        blockNetwork: false,
      }),
    ).rejects.toThrow(
      'Modal sandbox "live-session" is running and was not created with requestTransformations: true',
    );
    expect(spies.create).toHaveBeenCalledOnce();
    expect(running.spies.detach).toHaveBeenCalledOnce();
    expect(running.spies.terminate).not.toHaveBeenCalled();
  });

  it('restores a stopped sandbox with a new outbound policy', async () => {
    const { client, spies, app, snapshot } = makeStoppedFixture();
    const restored = makeMockSandbox();
    spies.create.mockResolvedValue(restored.sandbox);

    const session = await resumeModalNetworkSandboxSession({
      client,
      sandboxId: 'live-session',
      requestTransformations: true,
      blockNetwork: false,
    });
    await session.addRequestTransformations?.([
      {
        match: { host: 'api.example.com' },
        transform: { headers: { 'x-api-key': 'real' } },
      },
    ]);

    expect(spies.create).toHaveBeenCalledExactlyOnceWith(app, snapshot, {
      timeoutMs: 30 * 60 * 1_000,
      blockNetwork: false,
      ...TRANSFORMING,
      name: 'live-session',
    });
    expect(
      restored.spies.experimentalUpdateOutboundPolicy,
    ).toHaveBeenCalledOnce();
  });

  it('restores a stopped sandbox without request transformations unless asked', async () => {
    const { client, spies } = makeStoppedFixture();
    spies.create.mockResolvedValue(makeMockSandbox().sandbox);

    const session = await resumeModalNetworkSandboxSession({
      client,
      sandboxId: 'live-session',
      blockNetwork: false,
    });

    expect('addRequestTransformations' in session).toBe(false);
    expect(spies.create.mock.calls[0][2]).toEqual({
      timeoutMs: 30 * 60 * 1_000,
      blockNetwork: false,
      ...ALLOW_ALL,
      name: 'live-session',
    });
  });

  it('still refuses to restore a stopped sandbox without network settings', async () => {
    const { client, spies } = makeStoppedFixture();

    await expect(
      resumeModalNetworkSandboxSession({
        client,
        sandboxId: 'live-session',
        requestTransformations: true,
      }),
    ).rejects.toThrow(
      'Modal does not keep the network settings of a stopped sandbox, so pass blockNetwork or the outbound allowlists again, or blockNetwork: false to restore it with open outbound access.',
    );
    expect(spies.create).not.toHaveBeenCalled();
  });
});

const { ModalClientMock, MockOutboundPolicy } = vi.hoisted(() => ({
  ModalClientMock: vi.fn(),
  MockOutboundPolicy: class MockOutboundPolicy {
    constructor(
      readonly replacements: ReadonlyArray<{
        domain: string;
        headers: Record<string, string>;
      }> = [],
    ) {}

    withHeaderReplacement(replacement: {
      domain: string;
      headers: Record<string, string>;
    }) {
      return new MockOutboundPolicy([...this.replacements, replacement]);
    }
  },
}));

vi.mock('modal', () => ({
  ModalClient: ModalClientMock,
  ExperimentalOutboundPolicy: MockOutboundPolicy,
}));

function useDefaultClient(client: ModalClient) {
  ModalClientMock.mockImplementation(function () {
    return client;
  });
}

function makeModalError(name: string): Error {
  return Object.assign(new Error(name), { name });
}

type MockImage = Image & {
  commands: string[];
  publish: ReturnType<typeof vi.fn>;
};

function makeMockImage({
  tag = 'image',
  imageId = `im-${tag}`,
  commands = [],
}: { tag?: string; imageId?: string; commands?: string[] } = {}): MockImage {
  const image = {
    imageId,
    commands,
    dockerfileCommands: (layer: string[]) =>
      makeMockImage({ tag, imageId, commands: [...commands, ...layer] }),
    build: vi.fn(async () => image),
    publish: vi.fn(async () => {}),
  };
  return image as unknown as MockImage;
}

function makeMockClient() {
  const app = { appId: 'ap-harness' };
  const appFromName = vi.fn(async () => app);
  const fromRegistry = vi.fn((tag: string) => makeMockImage({ tag }));
  const imageFromName = vi.fn(async (_name: string): Promise<Image> => {
    throw makeModalError('NotFoundError');
  });
  const imageFromId = vi.fn(async (imageId: string) =>
    makeMockImage({ imageId }),
  );
  const imageDelete = vi.fn(async (_imageId: string) => {});
  const create = vi.fn();
  const sandboxFromName = vi.fn();
  const sandboxFromId = vi.fn();
  const client = {
    apps: { fromName: appFromName },
    images: {
      fromRegistry,
      fromName: imageFromName,
      fromId: imageFromId,
      delete: imageDelete,
    },
    sandboxes: { create, fromName: sandboxFromName, fromId: sandboxFromId },
  } as unknown as ModalClient;
  return {
    client,
    app,
    spies: {
      appFromName,
      fromRegistry,
      imageFromName,
      imageFromId,
      imageDelete,
      create,
      sandboxFromName,
      sandboxFromId,
    },
  };
}

/**
 * A client for which no sandbox runs under the session ID while its stop
 * snapshot exists.
 */
function makeStoppedFixture() {
  const fixture = makeMockClient();
  const snapshot = makeMockImage({ imageId: 'im-stopped' });
  fixture.spies.sandboxFromName.mockRejectedValue(
    makeModalError('NotFoundError'),
  );
  const missing = makeMockSandbox();
  missing.spies.poll.mockRejectedValue(
    Object.assign(new Error('not found'), { code: 5 }),
  );
  fixture.spies.sandboxFromId.mockResolvedValue(missing.sandbox);
  fixture.spies.imageFromName.mockResolvedValue(snapshot);
  fixture.spies.imageFromId.mockResolvedValue(snapshot);
  return { ...fixture, snapshot };
}

function makeMockSandbox({
  workingDirectory = '/',
  workingDirectoryExitCode = 0,
  exitCode = null,
  tunnels = {},
  tags = {},
}: {
  workingDirectory?: string;
  workingDirectoryExitCode?: number;
  exitCode?: number | null;
  tunnels?: Record<number, { url: string; unencryptedHost?: string }>;
  tags?: Record<string, string>;
} = {}) {
  const exec = vi.fn(async () => ({
    stdout: { readText: async () => `${workingDirectory}\n` },
    stderr: { readText: async () => '' },
    wait: async () => workingDirectoryExitCode,
  }));
  const terminate = vi.fn(async () => {});
  const detach = vi.fn();
  const poll = vi.fn(async () => exitCode);
  const getTunnels = vi.fn(async () => tunnels);
  const getTags = vi.fn(async () => tags);
  const snapshotFilesystem = vi.fn();
  const updateNetworkPolicy = vi.fn(async () => {});
  const experimentalUpdateOutboundPolicy = vi.fn(
    async (_policy: InstanceType<typeof MockOutboundPolicy>) => {},
  );
  const sandbox = {
    sandboxId: 'sb-harness',
    exec,
    terminate,
    detach,
    poll,
    tunnels: getTunnels,
    getTags,
    snapshotFilesystem,
    updateNetworkPolicy,
    experimentalUpdateOutboundPolicy,
  } as unknown as Sandbox;
  return {
    sandbox,
    spies: {
      exec,
      terminate,
      detach,
      poll,
      tunnels: getTunnels,
      snapshotFilesystem,
      experimentalUpdateOutboundPolicy,
    },
  };
}
