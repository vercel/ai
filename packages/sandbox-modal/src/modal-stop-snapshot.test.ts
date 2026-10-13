import type { Image, ModalClient, Sandbox } from 'modal';
import { describe, expect, it, vi } from 'vitest';
import {
  deleteStopSnapshot,
  findStopSnapshot,
  publishStopSnapshot,
} from './modal-stop-snapshot';

function makeModalError(name: string): Error {
  return Object.assign(new Error(name), { name });
}

function makeMockImage(imageId: string) {
  const publish = vi.fn(async (_name: string) => {});
  return { image: { imageId, publish } as unknown as Image, publish };
}

function makeMockClient() {
  const fromName = vi.fn(async (_name: string): Promise<Image> => {
    throw makeModalError('NotFoundError');
  });
  const fromId = vi.fn(async (imageId: string) => makeMockImage(imageId).image);
  const deleteImage = vi.fn(async (_imageId: string) => {});
  const client = {
    images: { fromName, fromId, delete: deleteImage },
  } as unknown as ModalClient;
  return { client, spies: { fromName, fromId, deleteImage } };
}

function makeMockSandbox({
  snapshotFilesystem = vi.fn(),
  exitCode = null,
}: {
  snapshotFilesystem?: ReturnType<typeof vi.fn>;
  exitCode?: number | null;
} = {}) {
  const poll = vi.fn(async () => exitCode);
  return {
    sandbox: { snapshotFilesystem, poll } as unknown as Sandbox,
    spies: { snapshotFilesystem, poll },
  };
}

describe('publishStopSnapshot', () => {
  it('publishes a snapshot under a name derived from the App and session ID', async () => {
    const publishedName = async (appName: string, sandboxId: string) => {
      const { image, publish } = makeMockImage('im-stopped');
      const { sandbox, spies } = makeMockSandbox({
        snapshotFilesystem: vi.fn(async () => image),
      });
      expect(await publishStopSnapshot({ sandbox, appName, sandboxId })).toBe(
        true,
      );
      expect(spies.snapshotFilesystem).toHaveBeenCalledExactlyOnceWith();
      return publish.mock.calls[0][0];
    };

    const name = await publishedName('my-app', 'live-session');
    expect(name).toMatch(/^ai-sdk-sandbox-stopped-[a-f0-9]{24}$/);
    expect(await publishedName('my-app', 'live-session')).toBe(name);
    expect(await publishedName('other-app', 'live-session')).not.toBe(name);
    expect(await publishedName('my-app', 'other-session')).not.toBe(name);
  });

  it('reports a sandbox that has already finished', async () => {
    const finished = Object.assign(new Error('failed precondition'), {
      code: 9,
    });
    const { sandbox } = makeMockSandbox({
      snapshotFilesystem: vi.fn().mockRejectedValue(finished),
      exitCode: 137,
    });

    expect(
      await publishStopSnapshot({
        sandbox,
        appName: 'my-app',
        sandboxId: 'live-session',
      }),
    ).toBe(false);
  });

  it('surfaces a failed snapshot of a sandbox that is still running', async () => {
    const refused = Object.assign(new Error('failed precondition'), {
      code: 9,
    });
    const timedOut = new Error('snapshot timed out');
    for (const failure of [refused, timedOut]) {
      const { sandbox } = makeMockSandbox({
        snapshotFilesystem: vi.fn().mockRejectedValue(failure),
      });

      await expect(
        publishStopSnapshot({
          sandbox,
          appName: 'my-app',
          sandboxId: 'live-session',
        }),
      ).rejects.toBe(failure);
    }
  });
});

describe('findStopSnapshot', () => {
  const session = { appName: 'my-app', sandboxId: 'live-session' };

  it('returns undefined when no snapshot was published', async () => {
    const { client, spies } = makeMockClient();

    expect(await findStopSnapshot({ client, ...session })).toBeUndefined();
    expect(spies.fromId).not.toHaveBeenCalled();
  });

  it('returns the image behind the published name', async () => {
    const { client, spies } = makeMockClient();
    const { image } = makeMockImage('im-stopped');
    spies.fromName.mockResolvedValue(makeMockImage('im-stopped').image);
    spies.fromId.mockResolvedValue(image);

    expect(await findStopSnapshot({ client, ...session })).toBe(image);
    expect(spies.fromId).toHaveBeenCalledExactlyOnceWith('im-stopped');
  });

  it('returns undefined when the published image was deleted', async () => {
    const { client, spies } = makeMockClient();
    spies.fromName.mockResolvedValue(makeMockImage('im-stopped').image);
    spies.fromId.mockRejectedValue(makeModalError('NotFoundError'));

    expect(await findStopSnapshot({ client, ...session })).toBeUndefined();
  });

  it('surfaces other lookup failures', async () => {
    const { client, spies } = makeMockClient();
    const unavailable = new Error('unavailable');
    spies.fromName.mockRejectedValue(unavailable);

    await expect(findStopSnapshot({ client, ...session })).rejects.toBe(
      unavailable,
    );
  });
});

describe('deleteStopSnapshot', () => {
  const session = { appName: 'my-app', sandboxId: 'live-session' };

  it('deletes the published snapshot image', async () => {
    const { client, spies } = makeMockClient();
    spies.fromName.mockResolvedValue(makeMockImage('im-stopped').image);

    await deleteStopSnapshot({ client, ...session });

    expect(spies.deleteImage).toHaveBeenCalledExactlyOnceWith('im-stopped');
  });

  it('does nothing when there is no snapshot', async () => {
    const { client, spies } = makeMockClient();

    await deleteStopSnapshot({ client, ...session });

    expect(spies.deleteImage).not.toHaveBeenCalled();
  });

  it('tolerates a snapshot that another caller deleted first', async () => {
    const { client, spies } = makeMockClient();
    spies.fromName.mockResolvedValue(makeMockImage('im-stopped').image);
    spies.deleteImage.mockRejectedValue(makeModalError('NotFoundError'));

    await expect(
      deleteStopSnapshot({ client, ...session }),
    ).resolves.toBeUndefined();
  });
});
