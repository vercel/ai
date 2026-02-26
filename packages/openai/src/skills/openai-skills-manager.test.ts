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

      const skillsManager = provider.skillsManager();
      await skillsManager.create({
        files: [{ path: 'index.ts', content: testFileContentBase64 }],
      });

      expect(server.calls[0].requestHeaders).toMatchObject({
        authorization: 'Bearer test-api-key',
      });
    });

    it('should map response to Experimental_SkillsManagerV1Skill', async () => {
      prepareResponse({
        url: 'https://api.openai.com/v1/skills',
        filename: 'openai-skill-create',
      });

      const skillsManager = provider.skillsManager();
      const result = await skillsManager.create({
        files: [{ path: 'index.ts', content: testFileContentBase64 }],
      });

      expect(result.skill).toMatchInlineSnapshot(`
        {
          "createdAt": 2026-02-26T04:01:19.000Z,
          "description": "A test skill for fixture capture",
          "id": "skill_699fc58f408c8191825d8d06ae75fd5c06de7b381a5db7f5",
          "name": "test-capture-skill",
          "source": "user",
          "updatedAt": 2026-02-26T04:01:19.000Z,
        }
      `);
    });

    it('should emit unsupported warning for displayTitle', async () => {
      prepareResponse({
        url: 'https://api.openai.com/v1/skills',
        filename: 'openai-skill-create',
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

      const skillsManager = provider.skillsManager();
      const result = await skillsManager.create({
        files: [
          {
            path: 'data.bin',
            content: new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]),
          },
        ],
      });

      expect(result.skill.id).toBe(
        'skill_699fc58f408c8191825d8d06ae75fd5c06de7b381a5db7f5',
      );
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

    it('should map response to Experimental_SkillsManagerV1Skill array', async () => {
      prepareResponse({
        url: 'https://api.openai.com/v1/skills',
        filename: 'openai-skill-list',
      });

      const skillsManager = provider.skillsManager();
      const result = await skillsManager.list();

      expect(result.skills).toMatchInlineSnapshot(`
        [
          {
            "createdAt": 2026-02-26T02:57:18.000Z,
            "description": "A greeting skill",
            "id": "skill_699fb68e4c588191834a1c72e682a4b10071874b35792a71",
            "name": "greeting",
            "source": "user",
            "updatedAt": 2026-02-26T02:57:18.000Z,
          },
          {
            "createdAt": 2026-02-26T02:30:47.000Z,
            "description": "A greeting skill",
            "id": "skill_699fb05754cc8191924d08e89d3b3ae20cb9c1856e6ae689",
            "name": "greeting",
            "source": "user",
            "updatedAt": 2026-02-26T02:30:47.000Z,
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

      const skillsManager = provider.skillsManager();
      await skillsManager.retrieve({ skillId: 'skill_abc123' });

      expect(server.calls[0].requestHeaders).toMatchObject({
        authorization: 'Bearer test-api-key',
      });
    });

    it('should map response to Experimental_SkillsManagerV1Skill', async () => {
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId',
        filename: 'openai-skill-retrieve',
      });

      const skillsManager = provider.skillsManager();
      const result = await skillsManager.retrieve({
        skillId: 'skill_abc123',
      });

      expect(result.skill).toMatchInlineSnapshot(`
        {
          "createdAt": 2026-02-26T04:01:19.000Z,
          "description": "A test skill for fixture capture",
          "id": "skill_699fc58f408c8191825d8d06ae75fd5c06de7b381a5db7f5",
          "name": "test-capture-skill",
          "source": "user",
          "updatedAt": 2026-02-26T04:01:19.000Z,
        }
      `);
    });

    it('should return empty warnings', async () => {
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId',
        filename: 'openai-skill-retrieve',
      });

      const skillsManager = provider.skillsManager();
      const result = await skillsManager.retrieve({
        skillId: 'skill_abc123',
      });

      expect(result.warnings).toMatchInlineSnapshot(`[]`);
    });
  });

  describe('update', () => {
    it('should create a version then promote default_version', async () => {
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId/versions',
        filename: 'openai-skill-version-create',
      });
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId',
        filename: 'openai-skill-update',
      });

      const skillsManager = provider.skillsManager();
      await skillsManager.update({
        skillId: 'skill_abc123',
        files: [{ path: 'index.ts', content: testFileContentBase64 }],
      });

      expect(server.calls).toHaveLength(2);

      expect(server.calls[0].requestMethod).toBe('POST');
      expect(server.calls[0].requestUrl).toBe(
        'https://api.openai.com/v1/skills/skill_abc123/versions',
      );
      const versionBody = await server.calls[0].requestBodyMultipart;
      expect(versionBody).toBeTruthy();
      expect(versionBody!['files[]']).toBeInstanceOf(File);

      expect(server.calls[1].requestMethod).toBe('POST');
      expect(server.calls[1].requestUrl).toBe(
        'https://api.openai.com/v1/skills/skill_abc123',
      );
      expect(await server.calls[1].requestBodyJson).toMatchObject({
        default_version: '2',
      });
    });

    it('should pass authorization headers on both requests', async () => {
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId/versions',
        filename: 'openai-skill-version-create',
      });
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId',
        filename: 'openai-skill-update',
      });

      const skillsManager = provider.skillsManager();
      await skillsManager.update({
        skillId: 'skill_abc123',
        files: [{ path: 'index.ts', content: testFileContentBase64 }],
      });

      expect(server.calls[0].requestHeaders).toMatchObject({
        authorization: 'Bearer test-api-key',
      });
      expect(server.calls[1].requestHeaders).toMatchObject({
        authorization: 'Bearer test-api-key',
      });
    });

    it('should prefer version create metadata over stale skill response', async () => {
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId/versions',
        filename: 'openai-skill-version-create',
      });
      prepareResponse({
        url: 'https://api.openai.com/v1/skills/:skillId',
        filename: 'openai-skill-update',
      });

      const skillsManager = provider.skillsManager();
      const result = await skillsManager.update({
        skillId: 'skill_abc123',
        files: [{ path: 'index.ts', content: testFileContentBase64 }],
      });

      expect(result.skill).toMatchInlineSnapshot(`
        {
          "createdAt": 2026-02-26T04:01:19.000Z,
          "description": "An updated test skill for fixture capture",
          "id": "skill_699fc58f408c8191825d8d06ae75fd5c06de7b381a5db7f5",
          "name": "test-capture-skill",
          "source": "user",
          "updatedAt": 2026-02-26T04:01:19.000Z,
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

      expect(result.skill.id).toBe(
        'skill_699fc58f408c8191825d8d06ae75fd5c06de7b381a5db7f5',
      );
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
