import { describe, expect, it } from 'vitest';
import { fileSearchArgsSchema } from './file-search';

describe('file-search filter schema', () => {
  describe('comparison filter operators', () => {
    it('should validate "eq" operator with string value', async () => {
      const args = {
        vectorStoreIds: ['vs_test'],
        filters: {
          key: 'author',
          type: 'eq',
          value: 'Jane Smith',
        },
      };

      const result = await fileSearchArgsSchema().validate!(args);
      expect(result.success).toBe(true);
    });

    it('should validate "ne" operator with number value', async () => {
      const args = {
        vectorStoreIds: ['vs_test'],
        filters: {
          key: 'version',
          type: 'ne',
          value: 1,
        },
      };

      const result = await fileSearchArgsSchema().validate!(args);
      expect(result.success).toBe(true);
    });

    it('should validate "gt" operator with number value', async () => {
      const args = {
        vectorStoreIds: ['vs_test'],
        filters: {
          key: 'priority',
          type: 'gt',
          value: 5,
        },
      };

      const result = await fileSearchArgsSchema().validate!(args);
      expect(result.success).toBe(true);
    });

    it('should validate "in" operator with string array value', async () => {
      const args = {
        vectorStoreIds: ['vs_test'],
        filters: {
          key: 'priority',
          type: 'in',
          value: ['high', 'medium'],
        },
      };

      const result = await fileSearchArgsSchema().validate!(args);
      expect(result.success).toBe(true);
    });

    it('should validate "in" operator with number array value', async () => {
      const args = {
        vectorStoreIds: ['vs_test'],
        filters: {
          key: 'version',
          type: 'in',
          value: [1, 2, 3],
        },
      };

      const result = await fileSearchArgsSchema().validate!(args);
      expect(result.success).toBe(true);
    });

    it('should validate "nin" operator with string array value', async () => {
      const args = {
        vectorStoreIds: ['vs_test'],
        filters: {
          key: 'status',
          type: 'nin',
          value: ['archived', 'deleted'],
        },
      };

      const result = await fileSearchArgsSchema().validate!(args);
      expect(result.success).toBe(true);
    });

    it('should validate "nin" operator with number array value', async () => {
      const args = {
        vectorStoreIds: ['vs_test'],
        filters: {
          key: 'priority',
          type: 'nin',
          value: [0, -1],
        },
      };

      const result = await fileSearchArgsSchema().validate!(args);
      expect(result.success).toBe(true);
    });
  });

  describe('compound filters', () => {
    it('should validate compound filter with "in" operator', async () => {
      const args = {
        vectorStoreIds: ['vs_test'],
        filters: {
          type: 'and',
          filters: [
            {
              key: 'priority',
              type: 'in',
              value: ['high', 'medium'],
            },
            {
              key: 'author',
              type: 'eq',
              value: 'John Doe',
            },
          ],
        },
      };

      const result = await fileSearchArgsSchema().validate!(args);
      expect(result.success).toBe(true);
    });

    it('should validate nested compound filter with "nin" operator', async () => {
      const args = {
        vectorStoreIds: ['vs_test'],
        filters: {
          type: 'or',
          filters: [
            {
              type: 'and',
              filters: [
                {
                  key: 'status',
                  type: 'nin',
                  value: ['archived', 'deleted'],
                },
                {
                  key: 'version',
                  type: 'gte',
                  value: 2,
                },
              ],
            },
            {
              key: 'priority',
              type: 'in',
              value: ['critical'],
            },
          ],
        },
      };

      const result = await fileSearchArgsSchema().validate!(args);
      expect(result.success).toBe(true);
    });
  });

  describe('invalid filters', () => {
    it('should reject invalid operator type', async () => {
      const args = {
        vectorStoreIds: ['vs_test'],
        filters: {
          key: 'author',
          type: 'invalid_op',
          value: 'test',
        },
      };

      const result = await fileSearchArgsSchema().validate!(args);
      expect(result.success).toBe(false);
    });

    it('should reject object value', async () => {
      const args = {
        vectorStoreIds: ['vs_test'],
        filters: {
          key: 'author',
          type: 'eq',
          value: { nested: 'object' },
        },
      };

      const result = await fileSearchArgsSchema().validate!(args);
      expect(result.success).toBe(false);
    });
  });
});
