import { generateText } from 'ai';
import { expect, it } from 'vitest';
import fs from 'fs';
import { describeIfCapability } from '../capability-test-utils';
import type { TestFunction } from './index';

export const run: TestFunction<'pdfInput'> = ({
  model,
  capabilities,
  skipUsage,
}) => {
  describeIfCapability(capabilities, ['pdfInput'], 'PDF Input', () => {
    it('should generate text with PDF input', async () => {
      const result = await generateText({
        model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Summarize the contents of this PDF.',
              },
              {
                type: 'file',
                data: fs.readFileSync('./data/ai.pdf').toString('base64'),
                mimeType: 'application/pdf',
              },
            ],
          },
        ],
      });

      expect(result.text).toBeTruthy();
      expect(result.text.toLowerCase()).toContain('embedding');
      if (!skipUsage) {
        expect(result.usage?.totalTokens).toBeGreaterThan(0);
      }
    });
  });
};
