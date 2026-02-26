import fs from 'node:fs';

import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';
import { describe, it, expect, vi } from 'vitest';
import { createOpenAI } from '../openai-provider';

vi.mock('../version', () => ({
  VERSION: '0.0.0-test',
}));

const provider = createOpenAI({ apiKey: 'test-api-key' });

const server = createTestServer({
  'https://api.openai.com/v1/skills': {},
  'https://api.openai.com/v1/skills/:skillId': {},
  'https://api.openai.com/v1/skills/:skillId/versions': {},
  'https://api.openai.com/v1/skills/:skillId/versions/:version': {},
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

describe('OpenAISkillsManager', () => {
  describe('create', () => {
    it('should send files as multipart form data', async () => {
      prepareResponse({
        url: 'https://api.openai.com/v1/skills',
        filename: 'openai-skill-create',
      });
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId/versions/:version',
        filename: 'openai-skill-version-retrieve',
      });

      const skillsManager = provider.skillsManager();
      await skillsManager.create({
        files: [{ path: 'index.ts', content: testFileContentBase64 }],
      });

      const body = await server.calls[0].requestBodyMultipart;
      expect(body).toBeTruthy();
      expect(body!['files[]']).toBeInstanceOf(File);
    });

    it('should pass authorization headers', async () => {
      prepareResponse({
        url: 'https://api.openai.com/v1/skills',
        filename: 'openai-skill-create',
      });
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId/versions/:version',
        filename: 'openai-skill-version-retrieve',
      });

      const skillsManager = provider.skillsManager();
      await skillsManager.create({
        files: [{ path: 'index.ts', content: testFileContentBase64 }],
      });

      expect(server.calls[0].requestHeaders).toMatchObject({
        authorization: 'Bearer test-api-key',
      });
    });

    it('should enrich with version metadata via version retrieve', async () => {
      prepareResponse({
        url: 'https://api.openai.com/v1/skills',
        filename: 'openai-skill-create',
      });
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId/versions/:version',
        filename: 'openai-skill-version-retrieve',
      });

      const skillsManager = provider.skillsManager();
      const result = await skillsManager.create({
        files: [{ path: 'index.ts', content: testFileContentBase64 }],
      });

      expect(server.calls).toHaveLength(2);
      expect(server.calls[1].requestMethod).toBe('GET');

      expect(result.skill).toMatchInlineSnapshot(`
        {
          "createdAt": 2023-11-14T22:13:20.000Z,
          "description": "A test skill",
          "id": "skill_abc123",
          "name": "my-skill",
          "source": "upload",
          "updatedAt": 2023-11-14T22:13:20.000Z,
        }
      `);
    });

    it('should emit unsupported warning for displayTitle', async () => {
      prepareResponse({
        url: 'https://api.openai.com/v1/skills',
        filename: 'openai-skill-create',
      });
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId/versions/:version',
        filename: 'openai-skill-version-retrieve',
      });

      const skillsManager = provider.skillsManager();
      const result = await skillsManager.create({
        files: [{ path: 'index.ts', content: testFileContentBase64 }],
        displayTitle: 'My Skill',
      });

      expect(result.warnings).toMatchInlineSnapshot(`
        [
          {
            "feature": "displayTitle",
            "type": "unsupported",
          },
        ]
      `);
    });

    it('should return no warnings when displayTitle is not set', async () => {
      prepareResponse({
        url: 'https://api.openai.com/v1/skills',
        filename: 'openai-skill-create',
      });
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId/versions/:version',
        filename: 'openai-skill-version-retrieve',
      });

      const skillsManager = provider.skillsManager();
      const result = await skillsManager.create({
        files: [{ path: 'index.ts', content: testFileContentBase64 }],
      });

      expect(result.warnings).toMatchInlineSnapshot(`[]`);
    });

    it('should handle Uint8Array file content', async () => {
      prepareResponse({
        url: 'https://api.openai.com/v1/skills',
        filename: 'openai-skill-create',
      });
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId/versions/:version',
        filename: 'openai-skill-version-retrieve',
      });

      const skillsManager = provider.skillsManager();
      const result = await skillsManager.create({
        files: [
          {
            path: 'data.bin',
            content: new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]),
          },
        ],
      });

      expect(result.skill.id).toBe('skill_abc123');
    });
  });

  describe('list', () => {
    it('should send a GET request with limit=100', async () => {
      prepareResponse({
        url: 'https://api.openai.com/v1/skills',
        filename: 'openai-skill-list',
      });

      const skillsManager = provider.skillsManager();
      await skillsManager.list();

      expect(server.calls[0].requestMethod).toBe('GET');
      expect(server.calls[0].requestUrlSearchParams.get('limit')).toBe('100');
    });

    it('should pass authorization headers', async () => {
      prepareResponse({
        url: 'https://api.openai.com/v1/skills',
        filename: 'openai-skill-list',
      });

      const skillsManager = provider.skillsManager();
      await skillsManager.list();

      expect(server.calls[0].requestHeaders).toMatchObject({
        authorization: 'Bearer test-api-key',
      });
    });

    it('should map response to SkillsManagerV1Skill array', async () => {
      prepareResponse({
        url: 'https://api.openai.com/v1/skills',
        filename: 'openai-skill-list',
      });

      const skillsManager = provider.skillsManager();
      const result = await skillsManager.list();

      expect(result.skills).toMatchInlineSnapshot(`
        [
          {
            "createdAt": 2023-11-14T22:13:20.000Z,
            "description": "A test skill",
            "id": "skill_abc123",
            "name": "my-skill",
            "source": "upload",
            "updatedAt": 2023-11-14T22:13:20.000Z,
          },
          {
            "createdAt": 2023-11-16T02:00:00.000Z,
            "description": "Another test skill",
            "id": "skill_def456",
            "name": "another-skill",
            "source": "upload",
            "updatedAt": 2023-11-16T02:00:00.000Z,
          },
        ]
      `);
    });

    it('should return empty warnings', async () => {
      prepareResponse({
        url: 'https://api.openai.com/v1/skills',
        filename: 'openai-skill-list',
      });

      const skillsManager = provider.skillsManager();
      const result = await skillsManager.list();

      expect(result.warnings).toMatchInlineSnapshot(`[]`);
    });
  });

  describe('retrieve', () => {
    it('should send a GET request to the correct URL', async () => {
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId',
        filename: 'openai-skill-retrieve',
      });
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId/versions/:version',
        filename: 'openai-skill-version-retrieve',
      });

      const skillsManager = provider.skillsManager();
      await skillsManager.retrieve({ skillId: 'skill_abc123' });

      expect(server.calls[0].requestMethod).toBe('GET');
      expect(server.calls[0].requestUrl).toBe(
        'https://api.openai.com/v1/skills/skill_abc123',
      );
    });

    it('should pass authorization headers', async () => {
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId',
        filename: 'openai-skill-retrieve',
      });
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId/versions/:version',
        filename: 'openai-skill-version-retrieve',
      });

      const skillsManager = provider.skillsManager();
      await skillsManager.retrieve({ skillId: 'skill_abc123' });

      expect(server.calls[0].requestHeaders).toMatchObject({
        authorization: 'Bearer test-api-key',
      });
    });

    it('should enrich with version metadata via version retrieve', async () => {
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId',
        filename: 'openai-skill-retrieve',
      });
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId/versions/:version',
        filename: 'openai-skill-version-retrieve',
      });

      const skillsManager = provider.skillsManager();
      const result = await skillsManager.retrieve({
        skillId: 'skill_abc123',
      });

      expect(server.calls).toHaveLength(2);
      expect(server.calls[1].requestMethod).toBe('GET');

      expect(result.skill).toMatchInlineSnapshot(`
        {
          "createdAt": 2023-11-14T22:13:20.000Z,
          "description": "A test skill",
          "id": "skill_abc123",
          "name": "my-skill",
          "source": "upload",
          "updatedAt": 2023-11-14T22:13:20.000Z,
        }
      `);
    });

    it('should return empty warnings', async () => {
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId',
        filename: 'openai-skill-retrieve',
      });
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId/versions/:version',
        filename: 'openai-skill-version-retrieve',
      });

      const skillsManager = provider.skillsManager();
      const result = await skillsManager.retrieve({
        skillId: 'skill_abc123',
      });

      expect(result.warnings).toMatchInlineSnapshot(`[]`);
    });
  });

  describe('update', () => {
    it('should create a version, retrieve the skill, then retrieve the version', async () => {
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId/versions',
        filename: 'openai-skill-version-create',
      });
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId',
        filename: 'openai-skill-update',
      });
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId/versions/:version',
        filename: 'openai-skill-version-retrieve-updated',
      });

      const skillsManager = provider.skillsManager();
      await skillsManager.update({
        skillId: 'skill_abc123',
        files: [{ path: 'index.ts', content: testFileContentBase64 }],
      });

      expect(server.calls).toHaveLength(3);

      expect(server.calls[0].requestMethod).toBe('POST');
      expect(server.calls[0].requestUrl).toBe(
        'https://api.openai.com/v1/skills/skill_abc123/versions',
      );
      const versionBody = await server.calls[0].requestBodyMultipart;
      expect(versionBody).toBeTruthy();
      expect(versionBody!['files[]']).toBeInstanceOf(File);

      expect(server.calls[1].requestMethod).toBe('GET');
      expect(server.calls[1].requestUrl).toBe(
        'https://api.openai.com/v1/skills/skill_abc123',
      );

      expect(server.calls[2].requestMethod).toBe('GET');
    });

    it('should pass authorization headers on all requests', async () => {
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId/versions',
        filename: 'openai-skill-version-create',
      });
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId',
        filename: 'openai-skill-update',
      });
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId/versions/:version',
        filename: 'openai-skill-version-retrieve-updated',
      });

      const skillsManager = provider.skillsManager();
      await skillsManager.update({
        skillId: 'skill_abc123',
        files: [{ path: 'index.ts', content: testFileContentBase64 }],
      });

      for (const call of server.calls) {
        expect(call.requestHeaders).toMatchObject({
          authorization: 'Bearer test-api-key',
        });
      }
    });

    it('should enrich with version metadata from version retrieve', async () => {
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId/versions',
        filename: 'openai-skill-version-create',
      });
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId',
        filename: 'openai-skill-update',
      });
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId/versions/:version',
        filename: 'openai-skill-version-retrieve-updated',
      });

      const skillsManager = provider.skillsManager();
      const result = await skillsManager.update({
        skillId: 'skill_abc123',
        files: [{ path: 'index.ts', content: testFileContentBase64 }],
      });

      expect(result.skill).toMatchInlineSnapshot(`
        {
          "createdAt": 2023-11-14T22:13:20.000Z,
          "description": "An updated skill",
          "id": "skill_abc123",
          "name": "my-skill",
          "source": "upload",
          "updatedAt": 2023-11-16T02:00:00.000Z,
        }
      `);
    });

    it('should return empty warnings', async () => {
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId/versions',
        filename: 'openai-skill-version-create',
      });
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId',
        filename: 'openai-skill-update',
      });
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId/versions/:version',
        filename: 'openai-skill-version-retrieve-updated',
      });

      const skillsManager = provider.skillsManager();
      const result = await skillsManager.update({
        skillId: 'skill_abc123',
        files: [{ path: 'index.ts', content: testFileContentBase64 }],
      });

      expect(result.warnings).toMatchInlineSnapshot(`[]`);
    });

    it('should handle Uint8Array file content', async () => {
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId/versions',
        filename: 'openai-skill-version-create',
      });
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId',
        filename: 'openai-skill-update',
      });
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId/versions/:version',
        filename: 'openai-skill-version-retrieve-updated',
      });

      const skillsManager = provider.skillsManager();
      const result = await skillsManager.update({
        skillId: 'skill_abc123',
        files: [
          {
            path: 'data.bin',
            content: new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]),
          },
        ],
      });

      expect(result.skill.id).toBe('skill_abc123');
    });
  });

  describe('delete', () => {
    it('should send a DELETE request to the correct URL', async () => {
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId',
        filename: 'openai-skill-delete',
      });

      const skillsManager = provider.skillsManager();
      await skillsManager.delete({ skillId: 'skill_abc123' });

      expect(server.calls[0].requestMethod).toBe('DELETE');
      expect(server.calls[0].requestUrl).toBe(
        'https://api.openai.com/v1/skills/skill_abc123',
      );
    });

    it('should only make a single request', async () => {
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId',
        filename: 'openai-skill-delete',
      });

      const skillsManager = provider.skillsManager();
      await skillsManager.delete({ skillId: 'skill_abc123' });

      expect(server.calls).toHaveLength(1);
    });

    it('should pass authorization headers', async () => {
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId',
        filename: 'openai-skill-delete',
      });

      const skillsManager = provider.skillsManager();
      await skillsManager.delete({ skillId: 'skill_abc123' });

      expect(server.calls[0].requestHeaders).toMatchObject({
        authorization: 'Bearer test-api-key',
      });
    });

    it('should return empty warnings', async () => {
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId',
        filename: 'openai-skill-delete',
      });

      const skillsManager = provider.skillsManager();
      const result = await skillsManager.delete({ skillId: 'skill_abc123' });

      expect(result.warnings).toMatchInlineSnapshot(`[]`);
    });
  });
});
