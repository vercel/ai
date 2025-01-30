import { embed, embedMany } from 'ai';
import { expect, it } from 'vitest';
import { describeIfCapability } from '../capability-test-utils';
import type { TestFunction } from './index';

export const run: TestFunction<'embedding'> = ({
  model,
  capabilities,
  skipUsage,
}) => {
  describeIfCapability(
    capabilities,
    ['embedding'],
    'Embedding Generation',
    () => {
      it('should generate single embedding', async () => {
        const result = await embed({
          model,
          value: 'This is a test sentence for embedding.',
        });

        expect(Array.isArray(result.embedding)).toBe(true);
        expect(result.embedding.length).toBeGreaterThan(0);
        if (!skipUsage) {
          expect(result.usage?.tokens).toBeGreaterThan(0);
        }
      });

      it('should generate multiple embeddings', async () => {
        const result = await embedMany({
          model,
          values: [
            'First test sentence.',
            'Second test sentence.',
            'Third test sentence.',
          ],
        });

        expect(Array.isArray(result.embeddings)).toBe(true);
        expect(result.embeddings.length).toBe(3);
        if (!skipUsage) {
          expect(result.usage?.tokens).toBeGreaterThan(0);
        }
      });
    },
  );
};
