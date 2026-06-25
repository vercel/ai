import { TextDecoder } from 'node:util';
import type {
  HttpFixture,
  HttpFixtureBody,
  ReplayRuntimeIdentity,
} from './http-fixture';

const REPLAY_PLACEHOLDERS = {
  sessionId: '__SESSION_ID__',
  sandboxName: '__SANDBOX_NAME__',
  workDir: '__WORKDIR__',
  bridgeDir: '__BRIDGE_DIR__',
  proxyUrl: '__PROXY_URL__',
} as const;
const REDACTED_SECRET = '__REDACTED_SECRET__';
const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'api-key',
  'anthropic-api-key',
  'openai-api-key',
]);
const SENSITIVE_ENV_KEY_PATTERN =
  /(?:API|AUTH|CREDENTIAL|KEY|PASSWORD|SECRET|TOKEN)/i;
const SECRET_VALUE_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'Vercel API key', pattern: /\bvck_[A-Za-z0-9_-]{16,}\b/g },
  { name: 'OpenAI API key', pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/g },
  { name: 'Anthropic API key', pattern: /\bsk-ant-[A-Za-z0-9_-]{16,}\b/g },
  {
    name: 'GitHub token',
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{16,}\b/g,
  },
  { name: 'Google API key', pattern: /\bAIza[A-Za-z0-9_-]{20,}\b/g },
  { name: 'Slack token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{16,}\b/g },
];

/*
 * Placeholder replacement is applied longest-source-first so that a value which
 * is a substring of another (e.g. the sessionId embedded inside the workDir)
 * does not get partially clobbered before the longer match runs.
 */
function buildFixtureizeReplacements(
  identity: ReplayRuntimeIdentity,
): Array<[from: string, to: string]> {
  const replacements: Array<[from: string, to: string]> = [
    [identity.bridgeDir, REPLAY_PLACEHOLDERS.bridgeDir],
    [identity.workDir, REPLAY_PLACEHOLDERS.workDir],
    [identity.proxyUrl, REPLAY_PLACEHOLDERS.proxyUrl],
    [identity.sandboxName, REPLAY_PLACEHOLDERS.sandboxName],
    [identity.sessionId, REPLAY_PLACEHOLDERS.sessionId],
  ];

  return replacements.sort(([a], [b]) => b.length - a.length);
}

function buildMaterializeReplacements(
  identity: ReplayRuntimeIdentity,
): Array<[from: string, to: string]> {
  return [
    [REPLAY_PLACEHOLDERS.bridgeDir, identity.bridgeDir],
    [REPLAY_PLACEHOLDERS.workDir, identity.workDir],
    [REPLAY_PLACEHOLDERS.proxyUrl, identity.proxyUrl],
    [REPLAY_PLACEHOLDERS.sandboxName, identity.sandboxName],
    [REPLAY_PLACEHOLDERS.sessionId, identity.sessionId],
  ];
}

export function applyStringReplacements(
  value: string,
  replacements: Array<[from: string, to: string]>,
): string {
  let next = value;
  for (const [from, to] of replacements) {
    if (from.length === 0) continue;
    next = next.split(from).join(to);
  }
  return next;
}

function fixtureizeString(
  value: string,
  identity?: ReplayRuntimeIdentity,
): string {
  return identity
    ? applyStringReplacements(value, buildFixtureizeReplacements(identity))
    : value;
}

function materializeString(
  value: string,
  identity?: ReplayRuntimeIdentity,
): string {
  return identity
    ? applyStringReplacements(value, buildMaterializeReplacements(identity))
    : value;
}

const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

function decodeUtf8Buffer(buffer: Buffer): string | undefined {
  if (buffer.includes(0)) return undefined;

  try {
    return UTF8_DECODER.decode(buffer);
  } catch {
    return undefined;
  }
}

function getHeaderValue(
  headers: Headers | Record<string, string>,
  name: string,
): string | undefined {
  if (headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }

  const match = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  );
  return match?.[1];
}

function parseJsonFixtureBody(text: string): unknown | undefined {
  const trimmed = text.trim();
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

export function bufferToFixtureBody(
  buffer: Buffer,
  headers?: Headers | Record<string, string>,
  identity?: ReplayRuntimeIdentity,
): HttpFixtureBody | undefined {
  if (buffer.byteLength === 0) return undefined;

  const text = decodeUtf8Buffer(buffer);
  if (text === undefined) {
    return { type: 'base64', value: buffer.toString('base64') };
  }

  const fixtureText = fixtureizeString(text, identity);
  const contentType = getHeaderValue(headers ?? {}, 'content-type') ?? '';
  const trimmed = fixtureText.trim();
  const shouldTryJson =
    contentType.includes('json') ||
    contentType.includes('x-ndjson') ||
    trimmed.startsWith('{') ||
    trimmed.startsWith('[');
  const parsedJson = shouldTryJson
    ? parseJsonFixtureBody(fixtureText)
    : undefined;

  if (parsedJson !== undefined) {
    return { type: 'json', value: parsedJson };
  }

  return { type: 'text', value: fixtureText };
}

export function fixtureBodyToBuffer(
  body: HttpFixtureBody | undefined,
  identity?: ReplayRuntimeIdentity,
): Buffer | undefined {
  if (!body) return undefined;

  switch (body.type) {
    case 'json':
      return Buffer.from(
        materializeString(JSON.stringify(body.value), identity),
        'utf8',
      );
    case 'text':
      return Buffer.from(materializeString(body.value, identity), 'utf8');
    case 'base64':
      return Buffer.from(body.value, 'base64');
  }
}

export function fixtureBodyToText(
  body: HttpFixtureBody | undefined,
  identity?: ReplayRuntimeIdentity,
): string | undefined {
  if (!body) return undefined;

  switch (body.type) {
    case 'json':
      return materializeString(JSON.stringify(body.value), identity);
    case 'text':
      return materializeString(body.value, identity);
    case 'base64':
      return decodeUtf8Buffer(Buffer.from(body.value, 'base64'));
  }
}

export function fixtureBodyExactKey(
  body: HttpFixtureBody | undefined,
): string | undefined {
  if (!body) return undefined;
  return JSON.stringify(body);
}

export function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

export function fixtureizeHeaders(
  headers: Record<string, string>,
  identity?: ReplayRuntimeIdentity,
): Record<string, string> {
  if (!identity) return headers;

  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      fixtureizeString(value, identity),
    ]),
  );
}

export function materializeHeaders(
  headers: Record<string, string>,
  identity?: ReplayRuntimeIdentity,
): Record<string, string> {
  if (!identity) return headers;

  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      materializeString(value, identity),
    ]),
  );
}

export function redactSecretHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      value && SENSITIVE_HEADER_NAMES.has(key.toLowerCase())
        ? REDACTED_SECRET
        : value,
    ]),
  );
}

function getKnownSecretValues(): Array<{ name: string; value: string }> {
  return Object.entries(process.env)
    .filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === 'string' &&
        entry[1].length >= 8 &&
        SENSITIVE_ENV_KEY_PATTERN.test(entry[0]),
    )
    .filter(([, value]) => value !== REDACTED_SECRET && !value.startsWith('__'))
    .map(([name, value]) => ({ name, value }));
}

function collectFixtureAuditTexts(fixture: HttpFixture): string[] {
  const texts = [JSON.stringify(fixture)];

  for (const exchange of fixture.exchanges) {
    for (const body of [exchange.request.body, exchange.response.body]) {
      const text = fixtureBodyToText(body);
      if (text !== undefined) texts.push(text);
    }
  }

  return texts;
}

/**
 * Hard gate run at save time: throws if any raw runtime identity value, raw
 * environment secret, or known secret-shaped token survives into the fixture.
 * This is what makes a recorded fixture safe to commit.
 */
export function auditHttpFixtureRedaction(
  fixture: HttpFixture,
  runtimeIdentity?: ReplayRuntimeIdentity,
): void {
  const texts = collectFixtureAuditTexts(fixture);
  const violations: string[] = [];
  const runtimeValues = runtimeIdentity
    ? [
        ['sessionId', runtimeIdentity.sessionId],
        ['sandboxName', runtimeIdentity.sandboxName],
        ['workDir', runtimeIdentity.workDir],
        ['bridgeDir', runtimeIdentity.bridgeDir],
        ['proxyUrl', runtimeIdentity.proxyUrl],
      ]
    : [];

  for (const [label, value] of runtimeValues) {
    if (value && texts.some(text => text.includes(value))) {
      violations.push(`raw runtime ${label}`);
    }
  }

  for (const { name, value } of getKnownSecretValues()) {
    if (texts.some(text => text.includes(value))) {
      violations.push(`raw environment secret ${name}`);
    }
  }

  for (const text of texts) {
    for (const { name, pattern } of SECRET_VALUE_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        violations.push(name);
      }
    }
  }

  if (violations.length > 0) {
    throw new Error(
      `Replay fixture redaction audit failed: ${Array.from(new Set(violations)).join(', ')}`,
    );
  }
}
