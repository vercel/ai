import { readFileSync } from 'node:fs';

/**
 * Fixture schema version for this package. Structurally mirrors the original
 * agent-harness-sdk v4 format (typed body discriminated union + placeholder
 * tokens); numbered fresh from 1 since no cross-repo compatibility is claimed.
 */
export const FIXTURE_VERSION = 1;

export type HttpFixtureBody =
  | { type: 'json'; value: unknown }
  | { type: 'text'; value: string }
  | { type: 'base64'; value: string };

export interface HttpExchange {
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: HttpFixtureBody;
    meta?: HttpRequestMatchMetadata;
  };
  response: {
    status: number;
    headers: Record<string, string>;
    body?: HttpFixtureBody;
  };
}

export interface HttpFixture {
  version?: number;
  description: string;
  recordedAt: string;
  exchanges: HttpExchange[];
}

export interface HttpRequestMatchMetadata {
  routeKey: string;
  canonicalBody?: string;
  semanticSignature?: string;
  firstTurnSignature?: string;
  routePolicy: string;
  reusable: boolean;
}

/**
 * The volatile per-run identity. Recording replaces these values with stable
 * placeholder tokens; replay materializes the tokens back to the current run's
 * values so the canned bytes line up with the live sandbox.
 */
export interface ReplayRuntimeIdentity {
  adapterName: string;
  scenario: string;
  fixtureKey: string;
  sessionId: string;
  sandboxName: string;
  workDir: string;
  bridgeDir: string;
  proxyUrl: string;
}

export function loadFixture(fixturePath: string): HttpFixture {
  return JSON.parse(readFileSync(fixturePath, 'utf8')) as HttpFixture;
}
