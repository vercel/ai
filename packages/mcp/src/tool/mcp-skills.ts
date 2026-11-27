import { convertBase64ToUint8Array } from '@ai-sdk/provider-utils';
import { MCPClientError } from '../error/mcp-client-error';
import type { MCPClient } from './mcp-client';
import type {
  ClientCapabilities,
  MCPSkill,
  MCPSkillResource,
  RequestOptions,
} from './types';

/**
 * MCP capability extension name used by hosts and servers supporting Agent Skills (SEP-2640).
 */
export const MCP_SKILLS_EXTENSION_NAME =
  'io.modelcontextprotocol/skills' as const;

/**
 * Client capabilities to pass to `createMCPClient` when the host supports MCP Skills.
 */
export const mcpSkillsClientCapabilities = {
  extensions: {
    [MCP_SKILLS_EXTENSION_NAME]: {},
  },
} as const satisfies ClientCapabilities;

/**
 * Normalized skill file returned by {@link readMCPSkillFile}.
 */
export type MCPSkillFile = {
  uri: string;
  mimeType?: string;
  bytes: Uint8Array;
  text: string;
  frontmatter?: Record<string, unknown>;
  body?: string;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

async function computeSha256Digest(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    bytes as Uint8Array<ArrayBuffer>,
  );
  return `sha256:${toHex(new Uint8Array(digest))}`;
}

function resolveSkillFileUri(skillUri: string, ref?: string): string {
  if (ref == null || ref === '') {
    return skillUri;
  }

  if (ref.startsWith('skill://')) {
    return ref;
  }

  const lastSlash = skillUri.lastIndexOf('/');
  if (lastSlash === -1) {
    throw new MCPClientError({
      message: `Cannot resolve relative skill reference "${ref}" against "${skillUri}"`,
    });
  }

  const baseDir = skillUri.slice(0, lastSlash + 1);
  const cleaned = ref.replace(/^\.\//, '');
  const segments = cleaned.split('/').filter(Boolean);
  if (
    segments.some(segment => segment === '..' || segment === '.') ||
    cleaned.startsWith('/')
  ) {
    throw new MCPClientError({
      message: `Invalid skill file reference "${ref}": path traversal is not allowed`,
    });
  }

  return `${baseDir}${segments.join('/')}`;
}

function parseYamlScalar(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === 'null' || trimmed === '~') {
    return null;
  }
  if (trimmed === 'true') {
    return true;
  }
  if (trimmed === 'false') {
    return false;
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    if (trimmed.startsWith('"')) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return trimmed.slice(1, -1);
      }
    }
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim();
    if (inner === '') {
      return [];
    }
    return inner.split(',').map(item => parseYamlScalar(item));
  }
  return trimmed;
}

function stripYamlComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle && line[i - 1] !== '\\') {
      inDouble = !inDouble;
    } else if (ch === '#' && !inSingle && !inDouble) {
      if (i === 0 || /\s/.test(line[i - 1])) {
        return line.slice(0, i);
      }
    }
  }
  return line;
}

function parseYamlBlock(
  lines: string[],
  startIndex: number,
  baseIndent: number,
): { value: Record<string, unknown> | unknown[]; nextIndex: number } {
  // Determine whether this block is a sequence or a mapping
  let i = startIndex;
  while (i < lines.length && stripYamlComment(lines[i]).trim() === '') {
    i++;
  }
  if (i >= lines.length) {
    return { value: {}, nextIndex: i };
  }

  const firstTrimmed = stripYamlComment(lines[i]).trim();
  if (firstTrimmed.startsWith('- ') || firstTrimmed === '-') {
    const arr: unknown[] = [];
    while (i < lines.length) {
      const cleaned = stripYamlComment(lines[i]);
      const trimmed = cleaned.trim();
      if (trimmed === '') {
        i++;
        continue;
      }
      const indent = cleaned.search(/\S/);
      if (indent < baseIndent) {
        break;
      }
      if (!trimmed.startsWith('- ') && trimmed !== '-') {
        break;
      }
      const rest = trimmed === '-' ? '' : trimmed.slice(2).trim();
      if (rest === '') {
        const nested = parseYamlBlock(lines, i + 1, indent + 2);
        arr.push(nested.value);
        i = nested.nextIndex;
      } else {
        arr.push(parseYamlScalar(rest));
        i++;
      }
    }
    return { value: arr, nextIndex: i };
  }

  const obj: Record<string, unknown> = {};
  while (i < lines.length) {
    const cleaned = stripYamlComment(lines[i]);
    const trimmed = cleaned.trim();
    if (trimmed === '') {
      i++;
      continue;
    }
    const indent = cleaned.search(/\S/);
    if (indent < baseIndent) {
      break;
    }
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) {
      throw new MCPClientError({
        message: `Invalid YAML frontmatter line: ${trimmed}`,
      });
    }
    const key = trimmed.slice(0, colonIdx).trim();
    const rawValue = trimmed.slice(colonIdx + 1).trim();
    if (rawValue === '') {
      const nested = parseYamlBlock(lines, i + 1, indent + 1);
      obj[key] = nested.value;
      i = nested.nextIndex;
    } else {
      obj[key] = parseYamlScalar(rawValue);
      i++;
    }
  }
  return { value: obj, nextIndex: i };
}

/**
 * Parses YAML frontmatter from a `SKILL.md` document.
 */
export function parseSkillFrontmatter(text: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n([\s\S]*))?$/);
  if (!match) {
    throw new MCPClientError({
      message: 'SKILL.md is missing valid YAML frontmatter delimited by ---',
    });
  }

  const [, rawYaml, body = ''] = match;
  const lines = rawYaml.split(/\r?\n/);
  const { value } = parseYamlBlock(lines, 0, 0);
  if (Array.isArray(value)) {
    throw new MCPClientError({
      message: 'SKILL.md frontmatter must be a YAML mapping',
    });
  }

  return { frontmatter: value, body };
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (
    a == null ||
    b == null ||
    typeof a !== 'object' ||
    typeof b !== 'object'
  ) {
    return false;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    return a.every((item, idx) => deepEqual(item, b[idx]));
  }
  const recordA = a as Record<string, unknown>;
  const recordB = b as Record<string, unknown>;
  const keysA = Object.keys(recordA);
  const keysB = Object.keys(recordB);
  if (keysA.length !== keysB.length) {
    return false;
  }
  return keysA.every(
    key =>
      Object.prototype.hasOwnProperty.call(recordB, key) &&
      deepEqual(recordA[key], recordB[key]),
  );
}

/**
 * Reads a skill file (`SKILL.md` or a listed supporting resource) through `resources/read`,
 * verifying manifest membership, byte size, SHA-256 digest, and (for `SKILL.md`) frontmatter.
 */
export async function readMCPSkillFile({
  client,
  skill,
  ref,
  options,
}: {
  client: Pick<MCPClient, 'readResource'>;
  skill: MCPSkill;
  ref?: string;
  options?: RequestOptions;
}): Promise<MCPSkillFile> {
  const targetUri = resolveSkillFileUri(skill.uri, ref);

  let manifestEntry: MCPSkillResource | undefined;
  if (skill.resources !== 'dynamic') {
    manifestEntry = skill.resources.find(entry => entry.uri === targetUri);
    if (manifestEntry == null) {
      throw new MCPClientError({
        message: `Skill resource is not listed in skill manifest: ${targetUri}`,
      });
    }
  }

  const readResult = await client.readResource({ uri: targetUri, options });
  const content = readResult.contents.find(item => item.uri === targetUri);
  if (content == null) {
    throw new MCPClientError({
      message: `Skill resource not found in read result: ${targetUri}`,
    });
  }

  let bytes: Uint8Array;
  let text: string;
  if ('blob' in content && typeof content.blob === 'string') {
    bytes = convertBase64ToUint8Array(content.blob);
    text = textDecoder.decode(bytes);
  } else if ('text' in content && typeof content.text === 'string') {
    text = content.text;
    bytes = textEncoder.encode(text);
  } else {
    throw new MCPClientError({
      message: `Unsupported skill resource content format: ${targetUri}`,
    });
  }

  if (manifestEntry != null) {
    if (bytes.byteLength !== manifestEntry.size) {
      throw new MCPClientError({
        message: `Skill resource size mismatch for ${targetUri}: expected ${manifestEntry.size} bytes, got ${bytes.byteLength}`,
      });
    }

    const actualDigest = await computeSha256Digest(bytes);
    if (actualDigest !== manifestEntry.digest) {
      throw new MCPClientError({
        message: `Skill resource digest mismatch for ${targetUri}: expected ${manifestEntry.digest}, got ${actualDigest}`,
      });
    }
  }

  const isSkillEntrypoint =
    targetUri === skill.uri || targetUri.endsWith('/SKILL.md');
  if (isSkillEntrypoint) {
    const { frontmatter, body } = parseSkillFrontmatter(text);
    if (!deepEqual(frontmatter, skill.frontmatter)) {
      throw new MCPClientError({
        message: `Skill frontmatter mismatch for ${targetUri}`,
      });
    }
    return {
      uri: targetUri,
      mimeType: content.mimeType,
      bytes,
      text,
      frontmatter,
      body,
    };
  }

  return {
    uri: targetUri,
    mimeType: content.mimeType,
    bytes,
    text,
  };
}
