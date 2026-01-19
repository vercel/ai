import { describe, it, expect, beforeEach } from 'vitest';
import type { MemoryAdapter } from '../memory-adapter';
import type {
    MemoryEntry,
    MemoryReadOptions,
    MemoryWriteOptions,
    MemoryReadResult
} from '../memory-entry';

/**
 * Test-only in-memory adapter implementation.
 * NOT exported as public API - only used for unit tests.
 */
class TestInMemoryAdapter implements MemoryAdapter {
    private store: Map<string, MemoryEntry[]> = new Map();
    private idCounter = 0;

    private generateId(): string {
        this.idCounter += 1;
        return `mem_${Date.now()}_${this.idCounter}`;
    }

    async write(
        entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
        options?: MemoryWriteOptions,
    ): Promise<MemoryEntry> {
        const [written] = await this.writeMany([entry], options);
        return written;
    }

    async writeMany(
        entries: (Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string })[],
        options?: MemoryWriteOptions,
    ): Promise<MemoryEntry[]> {
        const results: MemoryEntry[] = [];
        const now = new Date();

        for (const entry of entries) {
            const agentEntries = this.store.get(entry.agentId) ?? [];
            const entryId = entry.id ?? options?.id ?? this.generateId();
            const existingIndex = agentEntries.findIndex(e => e.id === entryId);

            const newEntry: MemoryEntry = {
                ...entry,
                id: entryId,
                createdAt: existingIndex >= 0 ? agentEntries[existingIndex].createdAt : now,
                updatedAt: now,
            };

            if (existingIndex >= 0) {
                agentEntries[existingIndex] = newEntry;
            } else {
                agentEntries.push(newEntry);
            }

            this.store.set(entry.agentId, agentEntries);
            results.push(newEntry);
        }

        return results;
    }

    async read(
        agentId: string,
        options?: MemoryReadOptions
    ): Promise<MemoryReadResult> {
        let entries = this.store.get(agentId) ?? [];

        if (options?.filter) {
            const filterEntries = Object.entries(options.filter);
            entries = entries.filter(e =>
                filterEntries.every(([key, value]) => e.metadata?.[key] === value),
            );
        }

        if (options?.orderBy) {
            const field = options.orderBy;
            const direction = options.orderDirection === 'desc' ? -1 : 1;
            entries = [...entries].sort((a, b) => {
                const aVal = (a[field] as Date)?.getTime() ?? 0;
                const bVal = (b[field] as Date)?.getTime() ?? 0;
                return (aVal - bVal) * direction;
            });
        }

        const offset = options?.offset ?? 0;
        const limit = options?.limit ?? entries.length;
        const pagedEntries = entries.slice(offset, offset + limit);

        return {
            entries: pagedEntries,
            nextCursor: offset + limit < entries.length ? String(offset + limit) : undefined,
        };
    }

    async readById(agentId: string, entryId: string): Promise<MemoryEntry | null> {
        const entries = this.store.get(agentId) ?? [];
        return entries.find(e => e.id === entryId) ?? null;
    }

    async update(
        agentId: string,
        entryId: string,
        updates: Partial<Omit<MemoryEntry, 'id' | 'agentId' | 'createdAt'>>,
    ): Promise<MemoryEntry> {
        const entries = this.store.get(agentId) ?? [];
        const index = entries.findIndex(e => e.id === entryId);

        if (index < 0) {
            throw new Error(`Memory entry not found: ${entryId}`);
        }

        const updatedEntry: MemoryEntry = {
            ...entries[index],
            ...updates,
            updatedAt: new Date(),
        };

        entries[index] = updatedEntry;
        this.store.set(agentId, entries);
        return updatedEntry;
    }

    async delete(agentId: string, entryId: string): Promise<void> {
        const entries = this.store.get(agentId) ?? [];
        const filtered = entries.filter(e => e.id !== entryId);
        this.store.set(agentId, filtered);
    }

    async clear(agentId: string): Promise<void> {
        this.store.delete(agentId);
    }

    async disconnect(): Promise<void> {
        this.store.clear();
    }
}

describe('MemoryAdapter (Unit Tests)', () => {
    let adapter: TestInMemoryAdapter;

    beforeEach(() => {
        adapter = new TestInMemoryAdapter();
    });

    describe('write', () => {
        it('should create a new memory entry with auto-generated id', async () => {
            const entry = await adapter.write({
                agentId: 'test-agent',
                content: 'Hello, world!',
                metadata: { topic: 'greeting' },
            });

            expect(entry.id).toBeDefined();
            expect(entry.agentId).toBe('test-agent');
            expect(entry.content).toBe('Hello, world!');
            expect(entry.metadata).toEqual({ topic: 'greeting' });
            expect(entry.createdAt).toBeInstanceOf(Date);
        });

        it('should use provided id when specified', async () => {
            const entry = await adapter.write(
                { agentId: 'test-agent', content: 'Test content' },
                { id: 'custom-id' },
            );

            expect(entry.id).toBe('custom-id');
        });
    });

    describe('REST/Pagination Support', () => {
        it('should support writeMany and nextCursor', async () => {
            await adapter.writeMany([
                { agentId: 'paged', content: '1' },
                { agentId: 'paged', content: '2' },
                { agentId: 'paged', content: '3' }
            ]);

            const firstPage = await adapter.read('paged', { limit: 2 });
            expect(firstPage.entries).toHaveLength(2);
            expect(firstPage.nextCursor).toBe('2');

            const secondPage = await adapter.read('paged', { offset: Number(firstPage.nextCursor) });
            expect(secondPage.entries).toHaveLength(1);
            expect(secondPage.entries[0].content).toBe('3');
        });
    });

    describe('readById', () => {
        it('should return entry by id', async () => {
            await adapter.write({ agentId: 'test', content: 'Test' }, { id: 'find-me' });

            const entry = await adapter.readById('test', 'find-me');
            expect(entry).not.toBeNull();
            expect(entry?.content).toBe('Test');
        });

        it('should return null for unknown id', async () => {
            const entry = await adapter.readById('test', 'unknown');
            expect(entry).toBeNull();
        });
    });

    describe('update', () => {
        it('should update entry content', async () => {
            await adapter.write({ agentId: 'test', content: 'Original' }, { id: 'update-me' });

            const updated = await adapter.update('test', 'update-me', { content: 'Updated' });
            expect(updated.content).toBe('Updated');
        });

        it('should throw error if entry not found', async () => {
            await expect(adapter.update('test', 'missing-id', { content: 'Fail' }))
                .rejects
                .toThrow('Memory entry not found: missing-id');
        });
    });

    describe('delete', () => {
        it('should remove entry', async () => {
            await adapter.write({ agentId: 'test', content: 'Delete me' }, { id: 'delete-me' });

            await adapter.delete('test', 'delete-me');

            const entry = await adapter.readById('test', 'delete-me');
            expect(entry).toBeNull();
        });
    });

    describe('clear', () => {
        it('should remove all entries for agent', async () => {
            await adapter.write({ agentId: 'test', content: 'Entry 1' });
            await adapter.write({ agentId: 'test', content: 'Entry 2' });

            await adapter.clear('test');

            const entries = (await adapter.read('test')).entries;
            expect(entries).toEqual([]);
        });
    });

    describe('disconnect', () => {
        it('should clear all data', async () => {
            await adapter.write({ agentId: 'agent-1', content: 'Data' });
            await adapter.write({ agentId: 'agent-2', content: 'Data' });

            await adapter.disconnect();

            const entries1 = (await adapter.read('agent-1')).entries;
            expect(entries1).toEqual([]);
        });
    });
});
