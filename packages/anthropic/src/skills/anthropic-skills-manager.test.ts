import fs from 'node:fs';

import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';
import { describe, it, expect, vi } from 'vitest';
import { createAnthropic } from '../anthropic-provider';

vi.mock('../version', () => ({
  VERSION: '0.0.0-test',
}));

const provider = createAnthropic({
  apiKey: 'test-api-key',
  baseURL: 'https://api.anthropic.com/v1',
});

const server = createTestServer({
  'https://api.anthropic.com/v1/skills': {},
  'https://api.anthropic.com/v1/skills/:skillId': {},
  'https://api.anthropic.com/v1/skills/:skillId/versions': {},
  'https://api.anthropic.com/v1/skills/:skillId/versions/:versionId': {},
});

const testFileContent = new TextEncoder().encode('console.log("hello")');
const testFileContentBase64 = convertUint8ArrayToBase64(testFileContent);

function prepareResponse({
  url,
  filename,
  headers,
}: {
  url: keyof typeof server.urls;
  filename: string;
  headers?: Record<string, string>;
}) {
  server.urls[url].response = {
    type: 'json-value',
    headers,
    body: JSON.parse(
      fs.readFileSync(`src/skills/__fixtures__/${filename}.json`, 'utf8'),
    ),
  };
}

function prepareVersionMetadataResponse() {
  prepareResponse({
    url: 'https://api.anthropic.com/v1/skills/:skillId/versions/:versionId',
    filename: 'anthropic-skill-version-create',
  });
}

describe('AnthropicSkillsManager', () => {
  describe('create', () => {
    it('should send files as multipart form data', async () => {
      prepareResponse({
        url: 'https://api.anthropic.com/v1/skills',
        filename: 'anthropic-skill-create',
      });
      prepareVersionMetadataResponse();

      const skillsManager = provider.skillsManager();
      await skillsManager.create({
        files: [{ path: 'index.ts', content: testFileContentBase64 }],
      });

      const body = await server.calls[0].requestBodyMultipart;
      expect(body).toBeTruthy();
      expect(body!['files[]']).toBeInstanceOf(File);
    });

    it('should include anthropic-beta header', async () => {
      prepareResponse({
        url: 'https://api.anthropic.com/v1/skills',
        filename: 'anthropic-skill-create',
      });
      prepareVersionMetadataResponse();

      const skillsManager = provider.skillsManager();
      await skillsManager.create({
        files: [{ path: 'index.ts', content: testFileContentBase64 }],
      });

      expect(server.calls[0].requestHeaders).toMatchObject({
        'anthropic-beta': 'skills-2025-10-02',
        'x-api-key': 'test-api-key',
      });
    });

    it('should include name and description from version metadata', async () => {
      prepareResponse({
        url: 'https://api.anthropic.com/v1/skills',
        filename: 'anthropic-skill-create',
      });
      prepareVersionMetadataResponse();

      const skillsManager = provider.skillsManager();
      const result = await skillsManager.create({
        files: [{ path: 'index.ts', content: testFileContentBase64 }],
      });

      expect(result.skill).toMatchInlineSnapshot(`
        {
          "createdAt": 2024-01-15T10:30:00.000Z,
          "description": "A test skill",
          "displayTitle": "My Skill",
          "id": "skill_xyz789",
          "name": "my-skill",
          "source": "upload",
          "updatedAt": 2024-01-15T10:30:00.000Z,
        }
      `);
    });

    it('should send display_title in form data when displayTitle is provided', async () => {
      prepareResponse({
        url: 'https://api.anthropic.com/v1/skills',
        filename: 'anthropic-skill-create',
      });
      prepareVersionMetadataResponse();

      const skillsManager = provider.skillsManager();
      await skillsManager.create({
        files: [{ path: 'index.ts', content: testFileContentBase64 }],
        displayTitle: 'My Custom Title',
      });

      const body = await server.calls[0].requestBodyMultipart;
      expect(body!.display_title).toBe('My Custom Title');
    });

    it('should not send display_title when displayTitle is not provided', async () => {
      prepareResponse({
        url: 'https://api.anthropic.com/v1/skills',
        filename: 'anthropic-skill-create',
      });
      prepareVersionMetadataResponse();

      const skillsManager = provider.skillsManager();
      await skillsManager.create({
        files: [{ path: 'index.ts', content: testFileContentBase64 }],
      });

      const body = await server.calls[0].requestBodyMultipart;
      expect(body!.display_title).toBeUndefined();
    });

    it('should return no warnings', async () => {
      prepareResponse({
        url: 'https://api.anthropic.com/v1/skills',
        filename: 'anthropic-skill-create',
      });
      prepareVersionMetadataResponse();

      const skillsManager = provider.skillsManager();
      const result = await skillsManager.create({
        files: [{ path: 'index.ts', content: testFileContentBase64 }],
      });

      expect(result.warnings).toMatchInlineSnapshot(`[]`);
    });
  });

  describe('list', () => {
    it('should send a GET request with limit=100', async () => {
      prepareResponse({
        url: 'https://api.anthropic.com/v1/skills',
        filename: 'anthropic-skill-list',
      });

      const skillsManager = provider.skillsManager();
      await skillsManager.list();

      expect(server.calls[0].requestMethod).toBe('GET');
      expect(server.calls[0].requestUrlSearchParams.get('limit')).toBe('100');
    });

    it('should include anthropic-beta header', async () => {
      prepareResponse({
        url: 'https://api.anthropic.com/v1/skills',
        filename: 'anthropic-skill-list',
      });

      const skillsManager = provider.skillsManager();
      await skillsManager.list();

      expect(server.calls[0].requestHeaders).toMatchObject({
        'anthropic-beta': 'skills-2025-10-02',
        'x-api-key': 'test-api-key',
      });
    });

    it('should map response to SkillsManagerV1Skill array', async () => {
      prepareResponse({
        url: 'https://api.anthropic.com/v1/skills',
        filename: 'anthropic-skill-list',
      });

      const skillsManager = provider.skillsManager();
      const result = await skillsManager.list();

      expect(result.skills).toMatchInlineSnapshot(`
        [
          {
            "createdAt": 2024-01-15T10:30:00.000Z,
            "displayTitle": "My Skill",
            "id": "skill_xyz789",
            "source": "upload",
            "updatedAt": 2024-01-15T10:30:00.000Z,
          },
          {
            "createdAt": 2024-01-16T12:00:00.000Z,
            "displayTitle": "Another Skill",
            "id": "skill_uvw012",
            "source": "upload",
            "updatedAt": 2024-01-16T12:00:00.000Z,
          },
        ]
      `);
    });

    it('should return empty warnings', async () => {
      prepareResponse({
        url: 'https://api.anthropic.com/v1/skills',
        filename: 'anthropic-skill-list',
      });

      const skillsManager = provider.skillsManager();
      const result = await skillsManager.list();

      expect(result.warnings).toMatchInlineSnapshot(`[]`);
    });
  });

  describe('retrieve', () => {
    it('should send a GET request to the correct URL', async () => {
      prepareResponse({
        url: 'https://api.anthropic.com/v1/skills/:skillId',
        filename: 'anthropic-skill-retrieve',
      });
      prepareVersionMetadataResponse();

      const skillsManager = provider.skillsManager();
      await skillsManager.retrieve({ skillId: 'skill_xyz789' });

      expect(server.calls[0].requestMethod).toBe('GET');
      expect(server.calls[0].requestUrl).toBe(
        'https://api.anthropic.com/v1/skills/skill_xyz789',
      );
    });

    it('should include anthropic-beta header', async () => {
      prepareResponse({
        url: 'https://api.anthropic.com/v1/skills/:skillId',
        filename: 'anthropic-skill-retrieve',
      });
      prepareVersionMetadataResponse();

      const skillsManager = provider.skillsManager();
      await skillsManager.retrieve({ skillId: 'skill_xyz789' });

      expect(server.calls[0].requestHeaders).toMatchObject({
        'anthropic-beta': 'skills-2025-10-02',
        'x-api-key': 'test-api-key',
      });
    });

    it('should include name and description from version metadata', async () => {
      prepareResponse({
        url: 'https://api.anthropic.com/v1/skills/:skillId',
        filename: 'anthropic-skill-retrieve',
      });
      prepareVersionMetadataResponse();

      const skillsManager = provider.skillsManager();
      const result = await skillsManager.retrieve({
        skillId: 'skill_xyz789',
      });

      expect(result.skill).toMatchInlineSnapshot(`
        {
          "createdAt": 2024-01-15T10:30:00.000Z,
          "description": "A test skill",
          "displayTitle": "My Skill",
          "id": "skill_xyz789",
          "name": "my-skill",
          "source": "upload",
          "updatedAt": 2024-01-15T10:30:00.000Z,
        }
      `);
    });

    it('should return empty warnings', async () => {
      prepareResponse({
        url: 'https://api.anthropic.com/v1/skills/:skillId',
        filename: 'anthropic-skill-retrieve',
      });
      prepareVersionMetadataResponse();

      const skillsManager = provider.skillsManager();
      const result = await skillsManager.retrieve({
        skillId: 'skill_xyz789',
      });

      expect(result.warnings).toMatchInlineSnapshot(`[]`);
    });
  });

  describe('update', () => {
    function prepareUpdateResponses() {
      prepareResponse({
        url: 'https://api.anthropic.com/v1/skills/:skillId/versions',
        filename: 'anthropic-skill-version-create',
      });
      prepareResponse({
        url: 'https://api.anthropic.com/v1/skills/:skillId',
        filename: 'anthropic-skill-update',
      });
    }

    it('should send files as multipart form data to versions endpoint', async () => {
      prepareUpdateResponses();

      const skillsManager = provider.skillsManager();
      await skillsManager.update({
        skillId: 'skill_xyz789',
        files: [{ path: 'index.ts', content: testFileContentBase64 }],
      });

      expect(server.calls[0].requestUrl).toBe(
        'https://api.anthropic.com/v1/skills/skill_xyz789/versions',
      );
      const body = await server.calls[0].requestBodyMultipart;
      expect(body).toBeTruthy();
      expect(body!['files[]']).toBeInstanceOf(File);
    });

    it('should create version then retrieve skill', async () => {
      prepareUpdateResponses();

      const skillsManager = provider.skillsManager();
      await skillsManager.update({
        skillId: 'skill_xyz789',
        files: [{ path: 'index.ts', content: testFileContentBase64 }],
      });

      expect(server.calls).toHaveLength(2);
      expect(server.calls[0].requestMethod).toBe('POST');
      expect(server.calls[1].requestMethod).toBe('GET');
      expect(server.calls[1].requestUrl).toBe(
        'https://api.anthropic.com/v1/skills/skill_xyz789',
      );
    });

    it('should include anthropic-beta header', async () => {
      prepareUpdateResponses();

      const skillsManager = provider.skillsManager();
      await skillsManager.update({
        skillId: 'skill_xyz789',
        files: [{ path: 'index.ts', content: testFileContentBase64 }],
      });

      expect(server.calls[0].requestHeaders).toMatchObject({
        'anthropic-beta': 'skills-2025-10-02',
        'x-api-key': 'test-api-key',
      });
    });

    it('should map response to SkillsManagerV1Skill', async () => {
      prepareUpdateResponses();

      const skillsManager = provider.skillsManager();
      const result = await skillsManager.update({
        skillId: 'skill_xyz789',
        files: [{ path: 'index.ts', content: testFileContentBase64 }],
      });

      expect(result.skill).toMatchInlineSnapshot(`
        {
          "createdAt": 2024-01-15T10:30:00.000Z,
          "description": "A test skill",
          "displayTitle": "My Skill",
          "id": "skill_xyz789",
          "name": "my-skill",
          "source": "upload",
          "updatedAt": 2024-01-16T12:00:00.000Z,
        }
      `);
    });

    it('should return empty warnings', async () => {
      prepareUpdateResponses();

      const skillsManager = provider.skillsManager();
      const result = await skillsManager.update({
        skillId: 'skill_xyz789',
        files: [{ path: 'index.ts', content: testFileContentBase64 }],
      });

      expect(result.warnings).toMatchInlineSnapshot(`[]`);
    });

    it('should handle Uint8Array file content', async () => {
      prepareUpdateResponses();

      const skillsManager = provider.skillsManager();
      const result = await skillsManager.update({
        skillId: 'skill_xyz789',
        files: [
          {
            path: 'data.bin',
            content: new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]),
          },
        ],
      });

      expect(result.skill.id).toBe('skill_xyz789');
    });
  });

  describe('delete', () => {
    function prepareDeleteResponses() {
      prepareResponse({
        url: 'https://api.anthropic.com/v1/skills/:skillId/versions',
        filename: 'anthropic-skill-version-list',
      });
      prepareResponse({
        url: 'https://api.anthropic.com/v1/skills/:skillId/versions/:versionId',
        filename: 'anthropic-skill-version-delete',
      });
      prepareResponse({
        url: 'https://api.anthropic.com/v1/skills/:skillId',
        filename: 'anthropic-skill-delete',
      });
    }

    it('should cascade: list versions, delete each, then delete skill', async () => {
      prepareDeleteResponses();

      const skillsManager = provider.skillsManager();
      await skillsManager.delete({ skillId: 'skill_xyz789' });

      expect(server.calls).toHaveLength(4);

      expect(server.calls[0].requestMethod).toBe('GET');
      expect(server.calls[0].requestUrl).toBe(
        'https://api.anthropic.com/v1/skills/skill_xyz789/versions',
      );

      expect(server.calls[1].requestMethod).toBe('DELETE');
      expect(server.calls[1].requestUrl).toBe(
        'https://api.anthropic.com/v1/skills/skill_xyz789/versions/1759178010641129',
      );

      expect(server.calls[2].requestMethod).toBe('DELETE');
      expect(server.calls[2].requestUrl).toBe(
        'https://api.anthropic.com/v1/skills/skill_xyz789/versions/1759178010641130',
      );

      expect(server.calls[3].requestMethod).toBe('DELETE');
      expect(server.calls[3].requestUrl).toBe(
        'https://api.anthropic.com/v1/skills/skill_xyz789',
      );
    });

    it('should include anthropic-beta header on all requests', async () => {
      prepareDeleteResponses();

      const skillsManager = provider.skillsManager();
      await skillsManager.delete({ skillId: 'skill_xyz789' });

      for (const call of server.calls) {
        expect(call.requestHeaders).toMatchObject({
          'anthropic-beta': 'skills-2025-10-02',
          'x-api-key': 'test-api-key',
        });
      }
    });

    it('should return empty warnings', async () => {
      prepareDeleteResponses();

      const skillsManager = provider.skillsManager();
      const result = await skillsManager.delete({ skillId: 'skill_xyz789' });

      expect(result.warnings).toMatchInlineSnapshot(`[]`);
    });

    it('should handle skill with no versions', async () => {
      server.urls[
        'https://api.anthropic.com/v1/skills/:skillId/versions'
      ].response = {
        type: 'json-value',
        body: { data: [] },
      };
      prepareResponse({
        url: 'https://api.anthropic.com/v1/skills/:skillId',
        filename: 'anthropic-skill-delete',
      });

      const skillsManager = provider.skillsManager();
      await skillsManager.delete({ skillId: 'skill_xyz789' });

      expect(server.calls).toHaveLength(2);
      expect(server.calls[0].requestMethod).toBe('GET');
      expect(server.calls[1].requestMethod).toBe('DELETE');
    });
  });
});
