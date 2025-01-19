import { generateText } from 'ai';
import { expect, it } from 'vitest';
import fs from 'fs';
import { describeIfCapability } from '../capability-test-utils';
import type { TestFunction } from './index';

export const run: TestFunction<'audioInput'> = ({ model, capabilities }) => {
  describeIfCapability(capabilities, ['audioInput'], 'Audio Input', () => {
    it('should generate text from audio input', async () => {
      const result = await generateText({
        model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Output a transcript of spoken words. Break up transcript lines when there are pauses. Include timestamps in the format of HH:MM:SS.SSS.',
              },
              {
                type: 'file',
                data: Buffer.from(fs.readFileSync('./data/galileo.mp3')),
                mimeType: 'audio/mpeg',
              },
            ],
          },
        ],
      });
      expect(result.text).toBeTruthy();
      expect(result.text.toLowerCase()).toContain('galileo');
      expect(result.usage?.totalTokens).toBeGreaterThan(0);
    });
  });
};
