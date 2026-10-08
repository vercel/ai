import type { JSONObject } from '@ai-sdk/provider';
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
export interface ManagedMCPEventOperations {
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
 * The URL is the configured HTTP/SSE endpoint, not a resolved redirect target.
 * Custom transports have no standard URL and receive undefined.
 */
export interface MCPEventsAdapter {
  createAdapter(context: {
    url: string | undefined;
  }): ManagedMCPEventOperations;
}

/** Catalog discovery uses MCP; all subscription operations use the adapter. */
export interface ManagedMCPEvents extends ManagedMCPEventOperations {
  list: MCPEvents['list'];
}

export function createManagedMCPEvents(
  operations: ManagedMCPEventOperations,
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
