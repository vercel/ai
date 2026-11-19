import { HarnessSandboxAuthenticationError } from '@ai-sdk/harness';
import type { App, Image, ModalClient, Sandbox, Tunnel } from 'modal';
import { describe, expect, it, vi } from 'vitest';
import {
  ensureTemplateImage,
  getEncryptedTunnelPorts,
  withModalSandboxAuthenticationError,
} from './utils';

function makeModalError(name: string): Error {
  return Object.assign(new Error(name), { name });
}

function makeMockImage(imageId: string) {
  const image = {
    imageId,
    build: vi.fn(async () => image),
    publish: vi.fn(async () => {}),
  };
  return image as unknown as Image & {
    build: ReturnType<typeof vi.fn>;
    publish: ReturnType<typeof vi.fn>;
  };
}

function makeTemplateFixture() {
  const templateImage = makeMockImage('im-template');
  const snapshotFilesystem = vi.fn(async () => templateImage);
  const terminate = vi.fn(async () => {});
  const detach = vi.fn();
  const sandbox = {
    snapshotFilesystem,
    terminate,
    detach,
  } as unknown as Sandbox;
  const fromName = vi.fn(async (_name: string): Promise<Image> => {
    throw makeModalError('NotFoundError');
  });
  const create = vi.fn(async () => sandbox);
  const client = {
    images: { fromName },
    sandboxes: { create },
  } as unknown as ModalClient;
  const app = { appId: 'ap-harness' } as App;
  return {
    client,
    app,
    sandbox,
    templateImage,
    spies: { fromName, create, snapshotFilesystem, terminate, detach },
  };
}

describe('Modal template images', () => {
  it('prepares, snapshots, and publishes a missing template image', async () => {
    const { client, app, sandbox, templateImage, spies } =
      makeTemplateFixture();
    const baseImage = makeMockImage('im-base');
    const prepare = vi.fn(async (_sandbox: Sandbox) => {});

    const image = await ensureTemplateImage({
      client,
      app,
      baseImage,
      createParams: {
        name: 'live-name',
        command: ['sleep', '60'],
        encryptedPorts: [4000],
        unencryptedPorts: [5432],
        timeoutMs: 60_000,
        env: { CI: '1' },
      },
      templateIdentity: 'recipe-one',
      prepare,
    });

    expect(image).toBe(templateImage);
    expect(baseImage.build).toHaveBeenCalledWith(app);
    expect(spies.create).toHaveBeenCalledWith(app, baseImage, {
      timeoutMs: 60_000,
      env: { CI: '1' },
    });
    expect(prepare).toHaveBeenCalledWith(sandbox);
    expect(spies.snapshotFilesystem).toHaveBeenCalledWith({ ttlMs: null });
    const templateImageName = spies.fromName.mock.calls[0][0];
    expect(templateImageName).toMatch(/^ai-sdk-harness-[a-f0-9]{24}$/);
    expect(templateImage.publish).toHaveBeenCalledWith(templateImageName);
    expect(spies.terminate).toHaveBeenCalledOnce();
    expect(spies.detach).toHaveBeenCalledOnce();
  });

  it('reuses a published template image without starting a sandbox', async () => {
    const { client, app, spies } = makeTemplateFixture();
    const published = makeMockImage('im-published');
    spies.fromName.mockResolvedValueOnce(published);
    const prepare = vi.fn(async () => {});

    const image = await ensureTemplateImage({
      client,
      app,
      baseImage: makeMockImage('im-base'),
      createParams: {},
      templateIdentity: 'recipe-one',
      prepare,
    });

    expect(image).toBe(published);
    expect(spies.create).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
  });

  it('names the image after the template identity and the base image', async () => {
    const nameFor = async (templateIdentity: string, baseImageId: string) => {
      const { client, app, spies } = makeTemplateFixture();
      await ensureTemplateImage({
        client,
        app,
        baseImage: makeMockImage(baseImageId),
        createParams: {},
        templateIdentity,
        prepare: async () => {},
      });
      return spies.fromName.mock.calls[0][0];
    };

    const name = await nameFor('recipe-one', 'im-base');
    expect(await nameFor('recipe-one', 'im-base')).toBe(name);
    expect(await nameFor('recipe-two', 'im-base')).not.toBe(name);
    expect(await nameFor('recipe-one', 'im-other')).not.toBe(name);
  });

  it('terminates the template sandbox when preparation fails', async () => {
    const { client, app, templateImage, spies } = makeTemplateFixture();
    const failure = new Error('bootstrap failed');

    await expect(
      ensureTemplateImage({
        client,
        app,
        baseImage: makeMockImage('im-base'),
        createParams: {},
        templateIdentity: 'recipe-one',
        prepare: async () => {
          throw failure;
        },
      }),
    ).rejects.toBe(failure);

    expect(spies.snapshotFilesystem).not.toHaveBeenCalled();
    expect(templateImage.publish).not.toHaveBeenCalled();
    expect(spies.terminate).toHaveBeenCalledOnce();
  });

  it('surfaces image lookup failures other than a missing image', async () => {
    const { client, app, spies } = makeTemplateFixture();
    const unavailable = new Error('unavailable');
    spies.fromName.mockRejectedValueOnce(unavailable);

    await expect(
      ensureTemplateImage({
        client,
        app,
        baseImage: makeMockImage('im-base'),
        createParams: {},
        templateIdentity: 'recipe-one',
        prepare: async () => {},
      }),
    ).rejects.toBe(unavailable);
    expect(spies.create).not.toHaveBeenCalled();
  });
});

describe('getEncryptedTunnelPorts', () => {
  it('lists TLS tunnels in ascending order', () => {
    const tunnels = {
      8080: { unencryptedHost: undefined },
      4000: {},
      5432: { unencryptedHost: 'r.modal.host' },
    } as unknown as Record<number, Tunnel>;

    expect(getEncryptedTunnelPorts(tunnels)).toEqual([4000, 8080]);
  });
});

describe('withModalSandboxAuthenticationError', () => {
  it('wraps authentication failures found in the cause chain', async () => {
    const cause = Object.assign(new Error('unauthenticated'), { code: 16 });
    const failure = Object.assign(new Error('request failed'), { cause });

    const error = await withModalSandboxAuthenticationError({
      operation: async () => {
        throw failure;
      },
    }).catch(error => error);

    expect(HarnessSandboxAuthenticationError.isInstance(error)).toBe(true);
    expect(error.message).toContain('MODAL_TOKEN_ID');
    expect(error.cause).toBe(failure);
  });

  it('passes other failures and results through', async () => {
    const failure = Object.assign(new Error('not found'), { code: 5 });

    await expect(
      withModalSandboxAuthenticationError({
        operation: async () => {
          throw failure;
        },
      }),
    ).rejects.toBe(failure);
    expect(
      await withModalSandboxAuthenticationError({
        operation: async () => 'ok',
      }),
    ).toBe('ok');
  });
});
