import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';
import { afterEach, describe, expect, it } from 'vitest';
import type { JSONRPCMessage } from './json-rpc-message';
import { createMCPClient, type MCPClient } from './mcp-client';
import {
  MCP_SKILLS_EXTENSION_NAME,
  mcpSkillsClientCapabilities,
  parseSkillFrontmatter,
  readMCPSkillFile,
} from './mcp-skills';
import type { MCPTransport } from './mcp-transport';
import type { MCPSkill } from './types';

async function sha256Digest(content: string | Uint8Array): Promise<string> {
  const bytes =
    typeof content === 'string' ? new TextEncoder().encode(content) : content;
  const digest = await crypto.subtle.digest(
    'SHA-256',
    bytes as Uint8Array<ArrayBuffer>,
  );
  const hex = Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `sha256:${hex}`;
}

function createSkillsTransport({
  supportsSkills = true,
  skills = [],
  resources = {},
}: {
  supportsSkills?: boolean;
  skills?: MCPSkill[];
  resources?: Record<
    string,
    { text?: string; blob?: string; mimeType?: string }
  >;
}): MCPTransport {
  return {
    onmessage: undefined,
    onclose: undefined,
    onerror: undefined,
    async start() {},
    async close() {},
    async send(message: JSONRPCMessage) {
      if (!('method' in message) || !('id' in message)) {
        return;
      }

      const reply = (result: unknown) => {
        queueMicrotask(() => {
          this.onmessage?.({
            jsonrpc: '2.0',
            id: message.id,
            result,
          } as JSONRPCMessage);
        });
      };

      const fail = (code: number, msg: string) => {
        queueMicrotask(() => {
          this.onmessage?.({
            jsonrpc: '2.0',
            id: message.id,
            error: { code, message: msg },
          } as JSONRPCMessage);
        });
      };

      switch (message.method) {
        case 'initialize':
          reply({
            protocolVersion: '2026-07-28',
            capabilities: {
              resources: {},
              ...(supportsSkills
                ? {
                    extensions: {
                      [MCP_SKILLS_EXTENSION_NAME]: { directoryRead: false },
                    },
                  }
                : {}),
            },
            serverInfo: { name: 'skills-test-server', version: '1.0.0' },
          });
          return;
        case 'skills/list': {
          const cursor = (message.params as { cursor?: string } | undefined)
            ?.cursor;
          reply({
            skills: cursor === 'page-2' ? skills.slice(1) : skills.slice(0, 1),
            ...(cursor == null && skills.length > 1
              ? { nextCursor: 'page-2' }
              : {}),
            ttlMs: 60_000,
            cacheScope: 'private',
          });
          return;
        }
        case 'skills/get': {
          const uri = (message.params as { uri: string }).uri;
          const skill = skills.find(s => s.uri === uri);
          if (!skill) {
            fail(-32602, `Unknown skill: ${uri}`);
            return;
          }
          reply(skill);
          return;
        }
        case 'resources/read': {
          const uri = (message.params as { uri: string }).uri;
          const entry = resources[uri];
          if (!entry) {
            fail(-32602, `Resource not found: ${uri}`);
            return;
          }
          reply({
            contents: [
              {
                uri,
                mimeType: entry.mimeType ?? 'text/markdown',
                ...(entry.blob !== undefined
                  ? { blob: entry.blob }
                  : { text: entry.text ?? '' }),
              },
            ],
          });
          return;
        }
        default:
          fail(-32601, `Method not found: ${message.method}`);
      }
    },
  };
}

describe('MCP Skills extension', () => {
  let client: MCPClient | undefined;

  afterEach(async () => {
    await client?.close();
    client = undefined;
  });

  it('exports MCP Skills client capabilities', () => {
    expect(mcpSkillsClientCapabilities).toEqual({
      extensions: {
        'io.modelcontextprotocol/skills': {},
      },
    });
  });

  it('parses YAML frontmatter and body from SKILL.md', () => {
    const parsed = parseSkillFrontmatter(
      [
        '---',
        'name: example-skill',
        'description: "Performs sample operations"',
        'version: 2',
        'enabled: true',
        'tags: [alpha, beta]',
        '---',
        '# Example Skill',
        'Follow these steps.',
      ].join('\n'),
    );

    expect(parsed.frontmatter).toEqual({
      name: 'example-skill',
      description: 'Performs sample operations',
      version: 2,
      enabled: true,
      tags: ['alpha', 'beta'],
    });
    expect(parsed.body).toBe('# Example Skill\nFollow these steps.');
  });

  it('lists and gets skills with ttlMs, cacheScope, and pagination', async () => {
    const skill1Text =
      '---\nname: skill-one\ndescription: First skill\n---\nBody one\n';
    const skill2Text =
      '---\nname: skill-two\ndescription: Second skill\n---\nBody two\n';
    const skill1: MCPSkill = {
      uri: 'skill://skill-one/SKILL.md',
      frontmatter: { name: 'skill-one', description: 'First skill' },
      resources: [
        {
          uri: 'skill://skill-one/SKILL.md',
          digest: await sha256Digest(skill1Text),
          size: new TextEncoder().encode(skill1Text).byteLength,
        },
      ],
    };
    const skill2: MCPSkill = {
      uri: 'skill://skill-two/SKILL.md',
      frontmatter: { name: 'skill-two', description: 'Second skill' },
      resources: [
        {
          uri: 'skill://skill-two/SKILL.md',
          digest: await sha256Digest(skill2Text),
          size: new TextEncoder().encode(skill2Text).byteLength,
        },
      ],
    };

    client = await createMCPClient({
      transport: createSkillsTransport({ skills: [skill1, skill2] }),
      protocolVersionDiscovery: false,
      capabilities: mcpSkillsClientCapabilities,
    });

    const page1 = await client.listSkills();
    expect(page1).toEqual({
      skills: [skill1],
      nextCursor: 'page-2',
      ttlMs: 60_000,
      cacheScope: 'private',
    });

    const page2 = await client.listSkills({ params: { cursor: 'page-2' } });
    expect(page2.skills).toEqual([skill2]);
    expect(page2.nextCursor).toBeUndefined();

    const fetched = await client.getSkill({
      uri: 'skill://skill-two/SKILL.md',
    });
    expect(fetched).toEqual(skill2);
  });

  it('rejects skills/list and skills/get when server does not advertise the skills extension', async () => {
    client = await createMCPClient({
      transport: createSkillsTransport({ supportsSkills: false }),
      protocolVersionDiscovery: false,
    });

    await expect(client.listSkills()).rejects.toThrow(
      'Server does not support skills',
    );
    await expect(
      client.getSkill({ uri: 'skill://missing/SKILL.md' }),
    ).rejects.toThrow('Server does not support skills');
  });

  it('reads and verifies SKILL.md and supporting resources', async () => {
    const skillText =
      '---\nname: policy-skill\ndescription: Checks policy\n---\n# Policy\nRead references.\n';
    const refText = 'Policy details here.';
    const refBytes = new TextEncoder().encode(refText);

    const skill: MCPSkill = {
      uri: 'skill://policy-skill/SKILL.md',
      frontmatter: { name: 'policy-skill', description: 'Checks policy' },
      resources: [
        {
          uri: 'skill://policy-skill/SKILL.md',
          digest: await sha256Digest(skillText),
          size: new TextEncoder().encode(skillText).byteLength,
        },
        {
          uri: 'skill://policy-skill/references/policy.md',
          digest: await sha256Digest(refBytes),
          size: refBytes.byteLength,
        },
      ],
    };

    client = await createMCPClient({
      transport: createSkillsTransport({
        skills: [skill],
        resources: {
          'skill://policy-skill/SKILL.md': { text: skillText },
          'skill://policy-skill/references/policy.md': {
            blob: convertUint8ArrayToBase64(refBytes),
          },
        },
      }),
      protocolVersionDiscovery: false,
    });

    const entrypoint = await readMCPSkillFile({ client, skill });
    expect(entrypoint.text).toBe(skillText);
    expect(entrypoint.frontmatter).toEqual(skill.frontmatter);
    expect(entrypoint.body).toBe('# Policy\nRead references.\n');

    const reference = await readMCPSkillFile({
      client,
      skill,
      ref: 'references/policy.md',
    });
    expect(reference.uri).toBe('skill://policy-skill/references/policy.md');
    expect(reference.text).toBe(refText);
    expect(reference.bytes).toEqual(refBytes);
    expect(reference.frontmatter).toBeUndefined();
  });

  it('rejects unlisted resources, path traversal, size/digest mismatches, and frontmatter mismatches', async () => {
    const skillText =
      '---\nname: strict-skill\ndescription: Strict\n---\nBody\n';
    const tamperedText =
      '---\nname: strict-skill\ndescription: Tampered\n---\nBody\n';
    const skill: MCPSkill = {
      uri: 'skill://strict-skill/SKILL.md',
      frontmatter: { name: 'strict-skill', description: 'Strict' },
      resources: [
        {
          uri: 'skill://strict-skill/SKILL.md',
          digest: await sha256Digest(skillText),
          size: new TextEncoder().encode(skillText).byteLength,
        },
      ],
    };

    client = await createMCPClient({
      transport: createSkillsTransport({
        skills: [skill],
        resources: {
          'skill://strict-skill/SKILL.md': { text: tamperedText },
        },
      }),
      protocolVersionDiscovery: false,
    });

    await expect(
      readMCPSkillFile({ client, skill, ref: 'references/unlisted.md' }),
    ).rejects.toThrow('Skill resource is not listed in skill manifest');

    await expect(
      readMCPSkillFile({ client, skill, ref: '../other/SKILL.md' }),
    ).rejects.toThrow('path traversal is not allowed');

    // Size mismatch (tamperedText is longer than skillText)
    await expect(readMCPSkillFile({ client, skill })).rejects.toThrow(
      'Skill resource size mismatch',
    );

    // Same size, wrong digest
    const sameSizeWrongDigestSkill: MCPSkill = {
      ...skill,
      resources: [
        {
          uri: 'skill://strict-skill/SKILL.md',
          digest: 'sha256:' + '0'.repeat(64),
          size: new TextEncoder().encode(tamperedText).byteLength,
        },
      ],
    };
    await expect(
      readMCPSkillFile({ client, skill: sameSizeWrongDigestSkill }),
    ).rejects.toThrow('Skill resource digest mismatch');

    // Matching size & digest, mismatched frontmatter
    const dynamicSkill: MCPSkill = {
      uri: 'skill://strict-skill/SKILL.md',
      frontmatter: { name: 'strict-skill', description: 'Strict' },
      resources: 'dynamic',
    };
    await expect(
      readMCPSkillFile({ client, skill: dynamicSkill }),
    ).rejects.toThrow('Skill frontmatter mismatch');
  });
});
