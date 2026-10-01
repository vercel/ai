import { HarnessSandboxAuthenticationError } from '@ai-sdk/harness';
import type { Image, ModalClient, Sandbox } from 'modal';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createModalNetworkSandboxSession,
  createModalNetworkSandboxSessionFromNativeSandbox,
  createModalSandboxSessionFromNativeSandbox,
  resumeModalNetworkSandboxSession,
} from './modal-sandbox';

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
    expect(params).toEqual({ timeoutMs: 30 * 60 * 1_000 });
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

  it('preserves native names and rejects a conflicting sandboxId', async () => {
    const { client, spies } = makeMockClient();
    spies.create.mockResolvedValue(makeMockSandbox().sandbox);

    const session = await createModalNetworkSandboxSession({
      client,
      name: 'same-name',
      sandboxId: 'same-name',
    });

    expect(session.id).toBe('same-name');
    expect(spies.create.mock.calls[0][2]).toEqual(
      expect.objectContaining({ name: 'same-name' }),
    );
    spies.create.mockClear();
    await expect(
      createModalNetworkSandboxSession({
        client,
        name: 'native-name',
        sandboxId: 'other-name',
      }),
    ).rejects.toThrow('sandboxId and name must match');
    expect(spies.create).not.toHaveBeenCalled();
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
    expect(calls[0][2]).toEqual({ timeoutMs: 30 * 60 * 1_000 });
    for (const call of calls.slice(1)) {
      expect(call[1]).toBe(templateImage);
      expect(call[2]).toEqual({
        encryptedPorts: [4000],
        name: 'live-name',
        timeoutMs: 30 * 60 * 1_000,
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

const { ModalClientMock } = vi.hoisted(() => ({ ModalClientMock: vi.fn() }));

vi.mock('modal', () => ({ ModalClient: ModalClientMock }));

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
  const imageFromName = vi.fn();
  const create = vi.fn();
  const sandboxFromName = vi.fn();
  const sandboxFromId = vi.fn();
  const client = {
    apps: { fromName: appFromName },
    images: { fromRegistry, fromName: imageFromName },
    sandboxes: { create, fromName: sandboxFromName, fromId: sandboxFromId },
  } as unknown as ModalClient;
  return {
    client,
    app,
    spies: {
      appFromName,
      fromRegistry,
      imageFromName,
      create,
      sandboxFromName,
      sandboxFromId,
    },
  };
}

function makeMockSandbox({
  workingDirectory = '/',
  workingDirectoryExitCode = 0,
  exitCode = null,
  tunnels = {},
}: {
  workingDirectory?: string;
  workingDirectoryExitCode?: number;
  exitCode?: number | null;
  tunnels?: Record<number, { url: string; unencryptedHost?: string }>;
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
  const snapshotFilesystem = vi.fn();
  const sandbox = {
    sandboxId: 'sb-harness',
    exec,
    terminate,
    detach,
    poll,
    tunnels: getTunnels,
    snapshotFilesystem,
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
    },
  };
}
