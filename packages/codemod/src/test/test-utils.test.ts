import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as testUtils from './test-utils';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse } from '@babel/parser';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock('path', () => ({
  join: vi.fn((...args) => args.join('/')),
}));

vi.mock('@babel/parser', () => ({
  parse: vi.fn(),
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
        expect.any(Object), // Expecting the 'options' argument
      );
    });

    it('should return original source when transform returns null', () => {
      const mockTransform = vi.fn().mockReturnValue(null);
      const input = 'original source';

      const result = testUtils.applyTransform(mockTransform, input);

      expect(result).toBe(input);
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
        expect.any(Object), // Expecting the 'options' argument
      );
    });

    it('should pass additional options to transform', () => {
      const mockTransform = vi.fn().mockReturnValue('modified');
      const options = { dry: true };

      testUtils.applyTransform(mockTransform, 'input', options);

      expect(mockTransform).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'test.tsx',
          source: 'input',
        }),
        expect.objectContaining({
          j: expect.any(Function),
          jscodeshift: expect.any(Function),
          stats: expect.any(Function),
          report: console.log,
        }),
        expect.objectContaining(options), // Verifying the 'options' argument
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

      expect(result).toEqual({
        content: 'ts content',
        extension: '.ts',
      });
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

      expect(result).toEqual({
        content: 'tsx content',
        extension: '.tsx',
      });
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

  describe('validateSyntax', () => {
    const mockParse = parse as unknown as ReturnType<typeof vi.fn>;

    it('should validate typescript syntax', () => {
      mockParse.mockImplementation(() => ({}));

      expect(() =>
        testUtils.validateSyntax('const x: number = 1;', '.ts'),
      ).not.toThrow();
      expect(mockParse).toHaveBeenCalledWith(
        'const x: number = 1;',
        expect.objectContaining({
          plugins: ['typescript'],
        }),
      );
    });

    it('should validate tsx syntax', () => {
      mockParse.mockImplementation(() => ({}));

      expect(() =>
        testUtils.validateSyntax('const x = <div />;', '.tsx'),
      ).not.toThrow();
      expect(mockParse).toHaveBeenCalledWith(
        'const x = <div />;',
        expect.objectContaining({
          plugins: ['typescript', 'jsx'],
        }),
      );
    });

    it('should throw on invalid syntax', () => {
      mockParse.mockImplementation(() => {
        throw new Error('Invalid syntax');
      });

      expect(() => testUtils.validateSyntax('const x =;', '.ts')).toThrow(
        'Syntax error',
      );
    });
  });

  describe('testTransform', () => {
    const mockParse = parse as unknown as ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockParse.mockImplementation(() => ({}));
    });

    it('should compare transform output with fixture and validate syntax', () => {
      const mockTransform = vi.fn().mockReturnValue('transformed');

      (existsSync as any).mockImplementation((path: string) =>
        path.endsWith('.ts'),
      );
      (readFileSync as any)
        .mockReturnValueOnce('input content')
        .mockReturnValueOnce('transformed');

      testUtils.testTransform(mockTransform, 'test');

      expect(mockTransform).toHaveBeenCalled();
      expect(readFileSync).toHaveBeenCalledTimes(2);
      expect(mockParse).toHaveBeenCalledTimes(2); // Validates both input and output
    });

    it('should throw when transform output does not match fixture', () => {
      const mockTransform = vi.fn().mockReturnValue('wrong output');

      (existsSync as any).mockImplementation((path: string) =>
        path.endsWith('.ts'),
      );
      (readFileSync as any)
        .mockReturnValueOnce('input')
        .mockReturnValueOnce('expected output');

      expect(() => testUtils.testTransform(mockTransform, 'test')).toThrow();
    });
  });
});
