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

    it('should map response to SkillsV4Skill', async () => {
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
          "description": "A test skill for fixture capture",
          "id": "skill_699fc58f408c8191825d8d06ae75fd5c06de7b381a5db7f5",
          "name": "test-capture-skill",
          "source": "user",
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
});
