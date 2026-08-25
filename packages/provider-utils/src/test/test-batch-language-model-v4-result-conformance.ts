import type { Experimental_BatchLanguageModelV4 as BatchLanguageModelV4 } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { convertReadableStreamToArray } from './convert-readable-stream-to-array';

type PreparedBatch = {
  model: BatchLanguageModelV4;
  batchId: string;
};

type PrepareBatch = () => PromiseLike<PreparedBatch> | PreparedBatch;

type ExpectedFailedItem = {
  id: string;
  error: {
    message: string;
    code: string;
  };
};

type ExpectedSucceededTextItem = {
  id: string;
  text: string;
};

/**
 * Registers the common result-lifecycle tests for a batch language model.
 */
export function testBatchLanguageModelV4ResultConformance({
  name,
  pendingBatch,
  invalidResponseBatch,
  completedWithoutOutputBatch,
  unsupportedContentBatch,
}: {
  name: string;
  pendingBatch: {
    prepare: PrepareBatch;
    errorMessage: string;
  };
  invalidResponseBatch: {
    prepare: PrepareBatch;
    invalidItem: ExpectedFailedItem;
    validItem: ExpectedSucceededTextItem;
  };
  completedWithoutOutputBatch: {
    prepare: PrepareBatch;
    errorMessage: string;
  };
  unsupportedContentBatch: {
    prepare: PrepareBatch;
    unsupportedItems: [ExpectedFailedItem, ...ExpectedFailedItem[]];
    validItem: ExpectedSucceededTextItem;
  };
}) {
  describe(`${name} batch result conformance`, () => {
    it('rejects result retrieval while the batch is pending', async () => {
      const { model, batchId } = await pendingBatch.prepare();

      await expect(
        model.experimental_doGetBatchResults({ batchId }),
      ).rejects.toMatchObject({
        name: 'AI_InvalidArgumentError',
        argument: 'batchId',
        message: pendingBatch.errorMessage,
      });
    });

    it('fails an invalid item and continues with later results', async () => {
      const { model, batchId } = await invalidResponseBatch.prepare();
      const stream = await model.experimental_doGetBatchResults({ batchId });
      const results = await convertReadableStreamToArray(stream);

      expect(results).toHaveLength(2);
      expect(results).toMatchObject([
        {
          id: invalidResponseBatch.invalidItem.id,
          status: 'failed',
          error: invalidResponseBatch.invalidItem.error,
        },
        {
          id: invalidResponseBatch.validItem.id,
          status: 'succeeded',
          result: {
            content: [
              { type: 'text', text: invalidResponseBatch.validItem.text },
            ],
          },
        },
      ]);
    });

    it('rejects a completed batch without output', async () => {
      const { model, batchId } = await completedWithoutOutputBatch.prepare();

      await expect(
        model.experimental_doGetBatchResults({ batchId }),
      ).rejects.toMatchObject({
        name: 'AI_InvalidResponseDataError',
        message: completedWithoutOutputBatch.errorMessage,
      });
    });

    it('fails unsupported items and continues with later results', async () => {
      const { model, batchId } = await unsupportedContentBatch.prepare();
      const stream = await model.experimental_doGetBatchResults({ batchId });
      const results = await convertReadableStreamToArray(stream);

      expect(results).toHaveLength(
        unsupportedContentBatch.unsupportedItems.length + 1,
      );
      expect(results).toMatchObject([
        ...unsupportedContentBatch.unsupportedItems.map(item => ({
          id: item.id,
          status: 'failed' as const,
          error: item.error,
        })),
        {
          id: unsupportedContentBatch.validItem.id,
          status: 'succeeded',
          result: {
            content: [
              { type: 'text', text: unsupportedContentBatch.validItem.text },
            ],
          },
        },
      ]);
    });
  });
}
