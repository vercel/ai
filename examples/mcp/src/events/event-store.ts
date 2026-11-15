import type {
  Experimental_MCPEventStore as MCPEventStore,
  Experimental_MCPEventSubscription as MCPEventSubscription,
} from '@ai-sdk/mcp';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { deserialize, serialize } from 'node:v8';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Single-process demo storage. Production adapters should use a database. */
export class FileEventStore implements MCPEventStore {
  private static pendingWrites = new Map<string, Promise<void>>();

  constructor(private readonly path: string) {}

  private async read(): Promise<Record<string, MCPEventSubscription>> {
    try {
      return deserialize(await readFile(this.path));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw error;
    }
  }

  private mutate(
    update: (records: Record<string, MCPEventSubscription>) => void,
  ) {
    const operation = (
      FileEventStore.pendingWrites.get(this.path) ?? Promise.resolve()
    ).then(async () => {
      const records = await this.read();
      update(records);
      const temporaryPath = `${this.path}.${randomUUID()}.tmp`;
      // Subscription records contain secrets: keep the file private and replace
      // it atomically so an interrupted write cannot corrupt saved state.
      await writeFile(temporaryPath, serialize(records), {
        mode: 0o600,
        flag: 'wx',
      });
      await rename(temporaryPath, this.path);
    });
    FileEventStore.pendingWrites.set(
      this.path,
      operation.catch(() => {}),
    );
    return operation;
  }

  async get(key: string) {
    await FileEventStore.pendingWrites.get(this.path);
    return (await this.read())[key];
  }

  async getById(id: string) {
    await FileEventStore.pendingWrites.get(this.path);
    return Object.values(await this.read()).find(record => record.id === id);
  }

  set(subscription: MCPEventSubscription) {
    return this.mutate(records => {
      records[subscription.key] = subscription;
    });
  }

  update(key: string, patch: Partial<MCPEventSubscription>) {
    return this.mutate(records => {
      if (!records[key]) throw new Error('Unknown subscription');
      records[key] = { ...records[key], ...patch };
    });
  }

  delete(key: string) {
    return this.mutate(records => {
      delete records[key];
    });
  }
}

// Shared by the subscribing client and webhook handler in this local demo.
export const eventStore = new FileEventStore(
  join(tmpdir(), 'ai-sdk-mcp-event-subscriptions.bin'),
);
