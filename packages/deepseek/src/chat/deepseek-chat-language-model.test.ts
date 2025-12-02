import { LanguageModelV3Prompt } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDeepSeek } from '../deepseek-provider';

const TEST_PROMPT: LanguageModelV3Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const provider = createDeepSeek({
  apiKey: 'test-api-key',
});

const server = createTestServer({
  'https://api.deepseek.com/v1/chat/completions': {},
});

describe('DeepSeekChatLanguageModel', () => {
  describe('doGenerate', () => {
    function prepareJsonFixtureResponse(filename: string) {
      server.urls['https://api.deepseek.com/v1/chat/completions'].response = {
        type: 'json-value',
        body: JSON.parse(
          fs.readFileSync(`src/chat/__fixtures__/${filename}.json`, 'utf8'),
        ),
      };
      return;
    }

    describe('basic text generation', () => {
      beforeEach(() => {
        prepareJsonFixtureResponse('deepseek-text');
      });

      it('should extract text content', async () => {
        const result = await provider.chat('deepseek-chat').doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "text": "## **Holiday Name: Gratitude of Small Things Day (GST Day)**

          **Date:** The first Saturday after the Spring Equinox (in the Northern Hemisphere) / the first Saturday after the Autumn Equinox (in the Southern Hemisphere). It is intentionally placed at a time of seasonal transition, encouraging people to pause and appreciate the subtle, often overlooked details of life.

          **Core Philosophy:** In a world focused on grand achievements and major events, GST Day celebrates the tiny, mundane, yet profoundly beautiful moments, objects, and sensations that form the quiet fabric of our existence. The motto is: *"Notice the thread, and you see the tapestry."*

          ---

          ### **Traditions & Practices:**

          **1. The "Quiet Hour" & Offering Bowl:**
             The holiday begins at sunrise with a "Quiet Hour." Individuals or households sit in a comfortable space with a small, empty bowl (the "Offering Bowl"). In silence, they reflect on the past year, noting not major events, but **small, specific gratitudes**: the sound of rain on a specific afternoon, the warmth of a mug in their hands, the scent of a loved one's laundry detergent, the way light fell through a window. They write each on a tiny slip of paper and place it in the bowl. These are not shared aloud; the act is purely personal and reflective.

          **2. The "Micro-Gift" Exchange:**
             Instead of lavish presents, people exchange",
              "type": "text",
            },
          ]
        `);
      });
    });
  });
});
