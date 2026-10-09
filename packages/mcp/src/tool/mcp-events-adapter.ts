import type { JSONObject } from '@ai-sdk/provider';
import { MCPClientError } from '../error/mcp-client-error';
import type { MCPEvents } from './mcp-event-types';
import type { RequestOptions } from './types';

/** A durable watch owned by the adapter's backend, not an upstream MCP lease. */
export type ManagedSubscription = {
  /** Backend subscription ID; use it for managed lifecycle operations. */
  id: string;
  name: string;
  arguments: JSONObject;
  status:
    | 'pending'
    | 'active'
    | 'needs_auth'
    | 'stopped'
    | 'expired'
    | 'failed';
  /** Application monitoring deadline. null means until explicitly stopped. */
  expiresAt: string | null;
  cleanupStatus?: 'pending' | 'complete' | 'exhausted';
};

export type ManagedSubscribeInput = {
  name: string;
  arguments: JSONObject;
  /** Application metadata, not an authorization grant. */
  context?: JSONObject;
  /** Reuse the original key when recovering an uncertain create result. */
  idempotencyKey: string;
  options?: RequestOptions;
} & (
  | { ttlMs: number; expiresAt?: never }
  | { expiresAt: string | null; ttlMs?: never }
);

/**
 * Bound to an authorized account and destination by the application. The backend
 * owns callback provisioning, verification, persistence, renewal and cleanup.
 * Implementations must honor request options and preserve actionable errors.
 * Cancelling a request does not cancel an already accepted remote subscription.
 */
export interface MCPEventOperations {
  subscribe(input: ManagedSubscribeInput): Promise<ManagedSubscription>;

  getSubscription(input: {
    id: string;
    options?: RequestOptions;
  }): Promise<ManagedSubscription>;

  listSubscriptions(input?: {
    cursor?: string;
    limit?: number;
    status?: ManagedSubscription['status'];
    options?: RequestOptions;
  }): Promise<{
    subscriptions: ManagedSubscription[];
    nextCursor?: string;
  }>;

  unsubscribe(input: {
    id: string;
    options?: RequestOptions;
  }): Promise<ManagedSubscription>;
}

/**
 * Creates bound subscription operations once per client, before the transport starts.
 * Receives transport metadata, not credentials or a live transport instance.
 * HTTP/SSE URLs are the configured endpoints, not resolved redirect targets.
 * Custom transports have no standard URL and receive only their type.
 */
export interface MCPEventAdapter {
  createAdapter(context: {
    transport: { type: 'http' | 'sse'; url: string } | { type: 'custom' };
  }): MCPEventOperations;
}

/** Validate JavaScript integrations before opening the MCP transport. */
export function validateMCPEventOperations(
  operations: unknown,
): asserts operations is MCPEventOperations {
  if (
    operations != null &&
    (typeof operations === 'object' || typeof operations === 'function') &&
    'then' in operations &&
    typeof operations.then === 'function'
  ) {
    // Consume a rejected async factory result so the configuration error does
    // not also cause an unhandled rejection. Async factories are not supported.
    void Promise.resolve(operations).catch(() => {});
    throw new MCPClientError({
      message:
        'experimental_events.adapter.createAdapter() must return operations synchronously. Promise and thenable results are not supported.',
    });
  }
  if (
    typeof operations !== 'object' ||
    operations === null ||
    !('subscribe' in operations) ||
    typeof operations.subscribe !== 'function' ||
    !('getSubscription' in operations) ||
    typeof operations.getSubscription !== 'function' ||
    !('listSubscriptions' in operations) ||
    typeof operations.listSubscriptions !== 'function' ||
    !('unsubscribe' in operations) ||
    typeof operations.unsubscribe !== 'function'
  ) {
    throw new MCPClientError({
      message:
        'experimental_events.adapter.createAdapter() must return an object implementing subscribe, getSubscription, listSubscriptions, and unsubscribe.',
    });
  }
}

/** Catalog discovery uses MCP; all subscription operations use the adapter. */
export interface ManagedMCPEvents extends MCPEventOperations {
  list: MCPEvents['list'];
}

export function createManagedMCPEvents(
  operations: MCPEventOperations,
  list: MCPEvents['list'],
): ManagedMCPEvents {
  return {
    list,
    subscribe: input => operations.subscribe(input),
    getSubscription: input => operations.getSubscription(input),
    listSubscriptions: input => operations.listSubscriptions(input),
    unsubscribe: input => operations.unsubscribe(input),
  };
}
