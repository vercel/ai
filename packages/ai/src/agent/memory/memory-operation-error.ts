import { AISDKError } from '@ai-sdk/provider';

const name = 'AI_MemoryOperationError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

/**
 * Error thrown when a memory operation fails.
 * 
 * @param options > The error details.
 * @param options.operation > The type of operation that failed.
 * @param options.agentId > The ID of the agent.
 * @param options.entryId > Optional ID of the specific entry.
 * @param options.cause > Optional underlying error.
 * @param options.message > Optional custom message.
 * @property > operation: 'read' | 'write' | 'search' | 'update' | 'delete' | 'clear';
 * @property > agentId: string;
 * @property > entryId?: string;
 * @property > cause?: Error;
 */
export class MemoryOperationError extends AISDKError {
    private readonly [symbol] = true; // used in isInstance
    readonly operation: 'read' | 'write' | 'search' | 'update' | 'delete' | 'clear';
    readonly agentId: string;
    readonly entryId?: string;
    readonly cause?: Error;
    constructor({
        operation,
        agentId,
        entryId,
        cause,
        message = `Memory ${operation} operation failed for agent '${agentId}'${entryId ? ` (entry: ${entryId})` : ''
        }${cause ? `: ${cause.message}` : '.'}`,
    }: {
        operation: 'read' | 'write' | 'search' | 'update' | 'delete' | 'clear';
        agentId: string;
        entryId?: string;
        cause?: Error;
        message?: string;
    }) {
        super({ name, message, cause });
        this.operation = operation;
        this.agentId = agentId;
        this.entryId = entryId;
        this.cause = cause;
    }

    static isInstance(error: unknown): error is MemoryOperationError {
        return AISDKError.hasMarker(error, marker);
    }
}
