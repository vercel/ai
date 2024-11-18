import { describe, it, expect, beforeEach, vi } from 'vitest';
import { API, FileInfo } from 'jscodeshift';
import * as testUtils from './test-utils';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock('path', () => ({
  join: vi.fn((...args) => args.join('/')),
}));

describe('test-utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('applyTransform', () => {
    it('should apply transform and return modified source when transform returns string', () => {
      const mockTransform = vi.fn().mockReturnValue('modified source');
      const input = 'original source';

      const result = testUtils.applyTransform(mockTransform, input);

      expect(result).toBe('modified source');
      expect(mockTransform).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'test.tsx',
          source: input,
        }),
        expect.objectContaining({
          j: expect.any(Function),
          jscodeshift: expect.any(Function),
          stats: expect.any(Function),
          report: console.log,
        }),
      );
    });

    it('should return original source when transform returns null', () => {
      const mockTransform = vi.fn().mockReturnValue(null);
      const input = 'original source';

      const result = testUtils.applyTransform(mockTransform, input);

      expect(result).toBe(input);
    });

    it('should pass additional options to transform', () => {
      const mockTransform = vi.fn().mockReturnValue('modified');
      const options = { dry: true };

      testUtils.applyTransform(mockTransform, 'input', options);

      expect(mockTransform).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining(options),
      );
    });
  });

  describe('readFixture', () => {
    const mockExistsSync = existsSync as unknown as ReturnType<typeof vi.fn>;
    const mockReadFileSync = readFileSync as unknown as ReturnType<
      typeof vi.fn
    >;
    const mockJoin = join as unknown as ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockJoin.mockImplementation((...parts) => parts.join('/'));
    });

    it('should read .ts fixture when it exists', () => {
      mockExistsSync.mockImplementation((path: string) => path.endsWith('.ts'));
      mockReadFileSync.mockReturnValue('ts content');

      const result = testUtils.readFixture('test', 'input');

      expect(result).toBe('ts content');
      expect(mockReadFileSync).toHaveBeenCalledWith(
        expect.stringContaining('test.input.ts'),
        'utf8',
      );
    });

    it('should read .tsx fixture when .ts does not exist', () => {
      mockExistsSync.mockImplementation((path: string) =>
        path.endsWith('.tsx'),
      );
      mockReadFileSync.mockReturnValue('tsx content');

      const result = testUtils.readFixture('test', 'input');

      expect(result).toBe('tsx content');
      expect(mockReadFileSync).toHaveBeenCalledWith(
        expect.stringContaining('test.input.tsx'),
        'utf8',
      );
    });

    it('should throw error when no fixture exists', () => {
      mockExistsSync.mockReturnValue(false);

      expect(() => testUtils.readFixture('test', 'input')).toThrow(
        'Fixture not found: test.input',
      );
    });
  });

  describe('testTransform', () => {
    it('should compare transform output with fixture', () => {
      const mockTransform = vi.fn().mockReturnValue('transformed');

      // Mock filesystem for this test
      (existsSync as any).mockImplementation((path: string) =>
        path.endsWith('.ts'),
      );
      (readFileSync as any)
        .mockReturnValueOnce('input content') // First call for input
        .mockReturnValueOnce('transformed'); // Second call for output

      testUtils.testTransform(mockTransform, 'test');

      expect(mockTransform).toHaveBeenCalled();
      expect(readFileSync).toHaveBeenCalledTimes(2);
    });

    it('should throw when transform output does not match fixture', () => {
      const mockTransform = vi.fn().mockReturnValue('wrong output');

      // Mock filesystem for this test
      (existsSync as any).mockImplementation((path: string) =>
        path.endsWith('.ts'),
      );
      (readFileSync as any)
        .mockReturnValueOnce('input') // First call for input
        .mockReturnValueOnce('expected output'); // Second call for output

      expect(() => testUtils.testTransform(mockTransform, 'test')).toThrow();
    });
  });
});
