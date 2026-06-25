import type { HttpFixtureBody, ReplayRuntimeIdentity } from './http-fixture';
import { fixtureBodyToText } from './http-fixture-body';

export function normalizeVolatileString(value: string): string {
  return normalizeCurlProgressOutput(value)
    .replace(
      /<system-reminder>\s*The following skills are available for use with the Skill tool:[\s\S]*?<\/system-reminder>/g,
      '<system-reminder>__AVAILABLE_SKILLS__</system-reminder>',
    )
    .replace(
      /<system-reminder>\s*As you answer the user's questions, you can use the following context:[\s\S]*?<\/system-reminder>/g,
      '<system-reminder>__USER_CONTEXT__</system-reminder>',
    )
    .replace(/cc_version=[^;]+/g, 'cc_version=__CLAUDE_CODE_VERSION__')
    .replace(/\/tmp\/codex-home-[A-Za-z0-9._-]+/g, '/tmp/codex-home-__ID__')
    .replace(
      /\/tmp\/harness-tool-(?:main|subagent-[A-Za-z0-9._-]+|\d+)\.mjs/g,
      '/tmp/harness-tool-__NAME__.mjs',
    )
    .replace(/__WORKDIR__/g, '/vercel/sandbox/__SANDBOX_PATH__')
    .replace(/__BRIDGE_DIR__/g, '/vercel/sandbox/__SANDBOX_PATH__')
    .replace(
      /\/vercel\/sandbox\/[A-Za-z0-9._/-]+/g,
      '/vercel/sandbox/__SANDBOX_PATH__',
    )
    .replace(/__SANDBOX_NAME__/g, 'agent-e2e-__SESSION__')
    .replace(/__SESSION_ID__/g, 'e2e-__SESSION__')
    .replace(/\bagent-e2e-[A-Za-z0-9._-]+\b/g, 'agent-e2e-__SESSION__')
    .replace(/\be2e-[A-Za-z0-9._-]+\b/g, 'e2e-__SESSION__')
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
      '__UUID__',
    )
    .replace(/\b[a-f0-9]{32,}\b/gi, '__HEX_ID__')
    .replace(/\b(?:call|gen|msg|req|ses|toolu)_[A-Za-z0-9_-]+\b/g, '__ID__')
    .replace(/\bcli-[A-Za-z0-9_-]+\b/g, 'cli-__ID__')
    .replace(/^Chunk ID:\s*[A-Za-z0-9_-]+$/gm, 'Chunk ID: __CHUNK_ID__')
    .replace(
      /^Wall time:\s*\d+(?:\.\d+)? seconds$/gm,
      'Wall time: __WALL_TIME__ seconds',
    )
    .replace(
      /^Original token count:\s*\d+$/gm,
      'Original token count: __TOKEN_COUNT__',
    )
    .replace(
      /^Process running with session ID\s+\d+$/gm,
      'Process running with session ID __SESSION_NUMBER__',
    )
    .replace(
      /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/g,
      '__ISO_TIMESTAMP__',
    )
    .replace(/\b\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\b/g, '__LOCAL_TIMESTAMP__')
    .replace(
      /<current_date>\d{4}-\d{2}-\d{2}<\/current_date>/g,
      '<current_date>__DATE__</current_date>',
    )
    .replace(
      /Today's date is \d{4}-\d{2}-\d{2}\b/g,
      "Today's date is __DATE__",
    );
}

function normalizeCurlProgressOutput(value: string): string {
  if (
    !value.includes('% Total') ||
    !value.includes('% Received') ||
    !value.includes('% Xferd')
  ) {
    return value;
  }

  const lines = value.split('\n');
  const normalized: string[] = [];
  let replacedProgress = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (isCurlProgressHeader(line)) {
      if (
        !replacedProgress ||
        normalized[normalized.length - 1] !== '__CURL_PROGRESS__'
      ) {
        normalized.push('__CURL_PROGRESS__');
      }
      replacedProgress = true;
      if (
        index + 1 < lines.length &&
        isCurlProgressColumnLine(lines[index + 1])
      ) {
        index += 1;
      }
      while (
        index + 1 < lines.length &&
        isCurlProgressMeterLine(lines[index + 1])
      ) {
        index += 1;
      }
      continue;
    }
    normalized.push(line);
  }

  return normalized.join('\n');
}

function isCurlProgressHeader(line: string): boolean {
  return /\s*%\s+Total\s+%\s+Received\s+%\s+Xferd\s+Average Speed\s+Time\s+Time\s+Time\s+Current/.test(
    line,
  );
}

function isCurlProgressColumnLine(line: string): boolean {
  return /\s*Dload\s+Upload\s+Total\s+Spent\s+Left\s+Speed/.test(line);
}

function isCurlProgressMeterLine(line: string): boolean {
  return /^\s*\d{1,3}\s+[\d.]+[A-Za-z]?\s+\d{1,3}\s+[\d.]+[A-Za-z]?\s+\d{1,3}\s+[\d.]+[A-Za-z]?/.test(
    line,
  );
}

function shouldDropReplayKey(key: string, path: string[]): boolean {
  if (
    [
      'id',
      'requestId',
      'request_id',
      'sessionId',
      'session_id',
      'user_id',
      'device_id',
      'account_uuid',
      'timestamp',
      'createdAt',
      'updatedAt',
      'traceparent',
      'tracestate',
      'prompt_cache_key',
    ].includes(key)
  ) {
    return true;
  }

  if (
    key === 'cache_control' ||
    key === 'context_management' ||
    key === 'thinking'
  ) {
    return true;
  }

  if (key === 'description' && path[path.length - 1] === 'tools') {
    return true;
  }

  return false;
}

function normalizeAttributeArray(value: unknown[]): unknown[] {
  return value
    .map(entry => normalizeJsonValue(entry, ['attributes']))
    .sort((a, b) => {
      const aKey =
        typeof a === 'object' &&
        a &&
        typeof (a as Record<string, unknown>).key === 'string'
          ? String((a as Record<string, unknown>).key)
          : '';
      const bKey =
        typeof b === 'object' &&
        b &&
        typeof (b as Record<string, unknown>).key === 'string'
          ? String((b as Record<string, unknown>).key)
          : '';
      return aKey === bKey
        ? JSON.stringify(a).localeCompare(JSON.stringify(b))
        : aKey.localeCompare(bKey);
    });
}

export function normalizeJsonValue(
  value: unknown,
  path: string[] = [],
): unknown {
  if (typeof value === 'string') {
    return normalizeVolatileString(value);
  }

  if (Array.isArray(value)) {
    if (
      path[path.length - 1] === 'attributes' &&
      value.every(
        entry =>
          entry &&
          typeof entry === 'object' &&
          typeof (entry as Record<string, unknown>).key === 'string' &&
          'value' in (entry as Record<string, unknown>),
      )
    ) {
      return normalizeAttributeArray(value);
    }

    return value.map(item => normalizeJsonValue(item, path));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !shouldDropReplayKey(key, path))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, nested]) => [key, normalizeJsonValue(nested, [...path, key])]);

  return Object.fromEntries(entries);
}

export function decodeBody(
  body?: HttpFixtureBody,
  identity?: ReplayRuntimeIdentity,
): string | undefined {
  return fixtureBodyToText(body, identity);
}

export function canonicalizeBody(body?: HttpFixtureBody): string | undefined {
  const decoded = decodeBody(body);
  if (!decoded) return undefined;

  const trimmed = decoded.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.stringify(normalizeJsonValue(JSON.parse(trimmed)));
    } catch {
      return normalizeVolatileString(trimmed);
    }
  }

  return normalizeVolatileString(trimmed);
}

export function tryParseJsonBody(body?: HttpFixtureBody): unknown {
  if (body && body.type === 'json') {
    return body.value;
  }

  const decoded = decodeBody(body);
  if (!decoded) return undefined;

  try {
    return JSON.parse(decoded);
  } catch {
    return undefined;
  }
}

function normalizeSemanticText(value: string): string {
  let normalized = normalizeVolatileString(value).replace(
    /<environment_context>[\s\S]*?<\/environment_context>/g,
    '<environment_context>__ENVIRONMENT__</environment_context>',
  );

  normalized = normalizeJudgeEvidencePrompt(normalized);

  const currentUserMessageIndex = normalized.indexOf('Current user message:');
  if (currentUserMessageIndex >= 0) {
    normalized = normalized.slice(currentUserMessageIndex);
  } else {
    normalized = normalized.replace(
      /^Your working directory(?: on disk)? is [\s\S]*?(?=\n\n|$)/,
      '',
    );
  }

  return normalized.replace(/\s+/g, ' ').trim();
}

function normalizeJudgeEvidencePrompt(value: string): string {
  if (
    !value.includes('Judge this completed eval run.') ||
    !value.includes('\nAgent final text:')
  ) {
    return value;
  }

  return `${value.slice(0, value.indexOf('\nAgent final text:'))}\nAgent final text:\n__JUDGE_EVIDENCE__`;
}

function shouldIgnoreSemanticText(value: string): boolean {
  return (
    value.length === 0 ||
    value === '<environment_context>__ENVIRONMENT__</environment_context>' ||
    value === '<system-reminder>__AVAILABLE_SKILLS__</system-reminder>' ||
    value === '<system-reminder>__USER_CONTEXT__</system-reminder>' ||
    value.includes('<environment_context>') ||
    value.includes(
      'The following skills are available for use with the Skill tool:',
    ) ||
    value.includes(
      "As you answer the user's questions, you can use the following context:",
    )
  );
}

function extractMeaningfulTextParts(content: unknown): string[] {
  if (typeof content === 'string') {
    const normalized = normalizeSemanticText(content);
    return shouldIgnoreSemanticText(normalized) ? [] : [normalized];
  }

  if (!Array.isArray(content)) {
    return [];
  }

  return content.flatMap(part => {
    if (typeof part === 'string') {
      const normalized = normalizeSemanticText(part);
      return shouldIgnoreSemanticText(normalized) ? [] : [normalized];
    }

    if (!part || typeof part !== 'object') {
      return [];
    }

    const record = part as Record<string, unknown>;
    const typePrefix =
      typeof record.type === 'string'
        ? `${normalizeVolatileString(record.type)}:`
        : '';

    if (typeof record.text === 'string') {
      const normalized = normalizeSemanticText(record.text);
      return shouldIgnoreSemanticText(normalized)
        ? []
        : [`${typePrefix}${normalized}`];
    }

    if (typeof record.input_text === 'string') {
      const normalized = normalizeSemanticText(record.input_text);
      return shouldIgnoreSemanticText(normalized)
        ? []
        : [`${typePrefix}${normalized}`];
    }

    if (typeof record.content === 'string') {
      const normalized = normalizeSemanticText(record.content);
      return shouldIgnoreSemanticText(normalized)
        ? []
        : [`${typePrefix}${normalized}`];
    }

    if (typeof record.tool_use_id === 'string') {
      return [
        `${typePrefix}tool_use_id=${normalizeVolatileString(record.tool_use_id)}`,
      ];
    }

    if (typeof record.name === 'string') {
      return [`${typePrefix}name=${normalizeVolatileString(record.name)}`];
    }

    return [];
  });
}

export function semanticRequestSignature(
  body?: HttpFixtureBody,
  options?: { firstUserTurnOnly?: boolean },
): string | undefined {
  const parsed = tryParseJsonBody(body);
  if (!parsed || typeof parsed !== 'object') {
    return undefined;
  }

  const record = parsed as Record<string, unknown>;
  const model =
    typeof record.model === 'string'
      ? normalizeVolatileString(record.model)
      : 'unknown-model';

  if (Array.isArray(record.messages)) {
    const userTurns = record.messages
      .filter(
        (message): message is Record<string, unknown> =>
          Boolean(message) &&
          typeof message === 'object' &&
          (message as Record<string, unknown>).role === 'user',
      )
      .map(message =>
        extractMeaningfulTextParts(message.content).join('\n').trim(),
      )
      .filter(Boolean);

    const relevantTurns = options?.firstUserTurnOnly
      ? userTurns.slice(0, 1)
      : userTurns;

    if (relevantTurns.length > 0) {
      return `messages:${model}:${relevantTurns.join('||')}`;
    }
  }

  if (Array.isArray(record.input)) {
    const userTurns = record.input
      .filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) &&
          typeof item === 'object' &&
          (item as Record<string, unknown>).role === 'user',
      )
      .flatMap(item => extractMeaningfulTextParts(item.content))
      .filter(Boolean);

    const relevantTurns = options?.firstUserTurnOnly
      ? userTurns.slice(0, 1)
      : userTurns;

    if (relevantTurns.length > 0) {
      return `input:${model}:${relevantTurns.join('||')}`;
    }
  }

  return undefined;
}

export function normalizeRouteKey(url: URL): string {
  const params: Array<[string, string]> = Array.from(
    url.searchParams.entries(),
  );
  params.sort(([aKey, aValue], [bKey, bValue]) => {
    if (aKey === bKey) {
      return aValue.localeCompare(bValue);
    }
    return aKey.localeCompare(bKey);
  });

  const normalizedSearch = new URLSearchParams();
  for (const [key, value] of params) {
    normalizedSearch.append(key, value);
  }

  const search = normalizedSearch.toString();
  return `${url.origin}${url.pathname}${search ? `?${search}` : ''}`;
}
