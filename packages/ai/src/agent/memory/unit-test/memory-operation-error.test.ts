import { describe, it, expect } from 'vitest';
import { MemoryOperationError } from '../memory-operation-error';

describe('MemoryOperationError', () => {
    describe('constructor', () => {
        it('should create error with required fields', () => {
            const error = new MemoryOperationError({
                operation: 'read',
                agentId: 'agent-1',
            });

            expect(error.operation).toBe('read');
            expect(error.agentId).toBe('agent-1');
            expect(error.message).toBe("Memory read operation failed for agent 'agent-1'.");
            expect(error.name).toBe('AI_MemoryOperationError');
        });

        it('should include entryId in message when provided', () => {
            const error = new MemoryOperationError({
                operation: 'delete',
                agentId: 'agent-1',
                entryId: 'entry-123',
            });

            expect(error.entryId).toBe('entry-123');
            expect(error.message).toBe(
                "Memory delete operation failed for agent 'agent-1' (entry: entry-123).",
            );
        });

        it('should include cause message when provided', () => {
            const cause = new Error('Connection refused');
            const error = new MemoryOperationError({
                operation: 'write',
                agentId: 'agent-1',
                cause,
            });

            expect(error.cause).toBe(cause);
            expect(error.message).toBe(
                "Memory write operation failed for agent 'agent-1': Connection refused",
            );
        });

        it('should use custom message when provided', () => {
            const error = new MemoryOperationError({
                operation: 'search',
                agentId: 'agent-1',
                message: 'Custom error message',
            });

            expect(error.message).toBe('Custom error message');
        });

        it('should support all operation types', () => {
            const operations = ['read', 'write', 'search', 'update', 'delete', 'clear'] as const;

            for (const operation of operations) {
                const error = new MemoryOperationError({
                    operation,
                    agentId: 'test-agent',
                });
                expect(error.operation).toBe(operation);
            }
        });
    });

    describe('isInstance', () => {
        it('should return true for MemoryOperationError instances', () => {
            const error = new MemoryOperationError({
                operation: 'read',
                agentId: 'agent-1',
            });

            expect(MemoryOperationError.isInstance(error)).toBe(true);
        });

        it('should return false for regular Error instances', () => {
            const error = new Error('Regular error');

            expect(MemoryOperationError.isInstance(error)).toBe(false);
        });

        it('should return false for null/undefined', () => {
            expect(MemoryOperationError.isInstance(null)).toBe(false);
            expect(MemoryOperationError.isInstance(undefined)).toBe(false);
        });

        it('should return false for non-error objects', () => {
            expect(MemoryOperationError.isInstance({ message: 'fake error' })).toBe(false);
            expect(MemoryOperationError.isInstance('string error')).toBe(false);
        });
    });
});
