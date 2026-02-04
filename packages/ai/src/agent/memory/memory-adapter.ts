import {
    MemoryEntry,
    MemoryReadOptions,
    MemoryReadResult,
    MemorySearchOptions,
    MemorySearchResult,
    MemoryWriteOptions,
} from './memory-entry';

/**
 * Interface for pluggable memory storage in the AI SDK.
 * 
 * Func
 * @write > Store a memory entry.
 * @writeMany > Batch store multiple memory entries.
 * @read > Read a single entry by ID.
 * @update > Update an existing entry (partial update).
 * @delete > Delete a specific entry.
 * @clear > Clear all memories for an agent.
 * @disconnect > Optional lifecycle method to close connections or cleanup resources.
 */
export interface MemoryAdapter {
    write(
        entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
        options?: MemoryWriteOptions,
    ): Promise<MemoryEntry>;
    writeMany?(
        entries: (Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string })[],
        options?: MemoryWriteOptions,
    ): Promise<MemoryEntry[]>;
    read(agentId: string, options?: MemoryReadOptions): Promise<MemoryReadResult>;
    search?(
        agentId: string,
        embedding: number[],
        options?: MemorySearchOptions,
    ): Promise<MemorySearchResult>;
    readById?(agentId: string, entryId: string): Promise<MemoryEntry | null>;
    update?(
        agentId: string,
        entryId: string,
        updates: Partial<Omit<MemoryEntry, 'id' | 'agentId' | 'createdAt'>>,
    ): Promise<MemoryEntry>;
    delete?(agentId: string, entryId: string): Promise<void>;
    clear?(agentId: string, options?: { namespace?: string }): Promise<void>;
    disconnect?(): Promise<void>;
}
