import type {
  ImageModelV2CallWarning,
  LanguageModelV2CallWarning,
} from '@ai-sdk/provider';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FIRST_WARNING_INFO_MESSAGE,
  logWarnings,
  resetLogWarningsState,
  type Warning,
} from './log-warnings';

const mockConsoleWarn = vi.fn();
const mockConsoleInfo = vi.fn();
vi.stubGlobal('console', { warn: mockConsoleWarn, info: mockConsoleInfo });

const mockProcessEmitWarning = vi
  .spyOn(process, 'emitWarning')
  .mockImplementation(() => {});

describe('logWarnings', () => {
  beforeEach(() => {
    mockConsoleWarn.mockClear();
    mockConsoleInfo.mockClear();
    mockProcessEmitWarning.mockClear();
    resetLogWarningsState();
    delete globalThis.AI_SDK_LOG_WARNINGS;
  });

  afterEach(() => {
    delete globalThis.AI_SDK_LOG_WARNINGS;
  });

  describe('when AI_SDK_LOG_WARNINGS is false', () => {
    it('should not log warnings', () => {
      globalThis.AI_SDK_LOG_WARNINGS = false;

      logWarnings([
        {
          type: 'other',
          message: 'Test warning',
        } as LanguageModelV2CallWarning,
      ]);

      expect(mockConsoleInfo).not.toHaveBeenCalled();
      expect(mockConsoleWarn).not.toHaveBeenCalled();
      expect(mockProcessEmitWarning).not.toHaveBeenCalled();
    });
  });

  describe('when AI_SDK_LOG_WARNINGS is a custom function', () => {
    it('should call the custom function with warnings', () => {
      const customLogger = vi.fn();
      globalThis.AI_SDK_LOG_WARNINGS = customLogger;
      const warnings: Warning[] = [
        {
          type: 'other',
          message: 'Test warning',
        } as LanguageModelV2CallWarning,
      ];

      logWarnings(warnings);

      expect(customLogger).toHaveBeenCalledOnce();
      expect(customLogger).toHaveBeenCalledWith(warnings);
      expect(mockConsoleInfo).not.toHaveBeenCalled();
      expect(mockConsoleWarn).not.toHaveBeenCalled();
      expect(mockProcessEmitWarning).not.toHaveBeenCalled();
    });

    it('should not call the custom function for an empty warnings array', () => {
      const customLogger = vi.fn();
      globalThis.AI_SDK_LOG_WARNINGS = customLogger;

      logWarnings([]);

      expect(customLogger).not.toHaveBeenCalled();
      expect(mockConsoleInfo).not.toHaveBeenCalled();
      expect(mockConsoleWarn).not.toHaveBeenCalled();
      expect(mockProcessEmitWarning).not.toHaveBeenCalled();
    });
  });

  describe('when AI_SDK_LOG_WARNINGS is unset/undefined', () => {
    it('should emit the information note and warning via process.emitWarning without logging to stdout', () => {
      logWarnings([
        {
          type: 'other',
          message: 'Test warning message',
        } as LanguageModelV2CallWarning,
      ]);

      expect(mockConsoleInfo).not.toHaveBeenCalled();
      expect(mockConsoleWarn).not.toHaveBeenCalled();
      expect(mockProcessEmitWarning).toHaveBeenCalledTimes(2);
      expect(mockProcessEmitWarning).toHaveBeenNthCalledWith(
        1,
        FIRST_WARNING_INFO_MESSAGE,
        { type: 'Warning' },
      );
      expect(mockProcessEmitWarning).toHaveBeenNthCalledWith(
        2,
        'AI SDK Warning: Test warning message',
        { type: 'Warning' },
      );
    });

    it('should only emit the information note on the first non-empty call', () => {
      logWarnings([]);
      logWarnings([
        {
          type: 'other',
          message: 'First warning',
        } as LanguageModelV2CallWarning,
      ]);
      logWarnings([
        {
          type: 'other',
          message: 'Second warning',
        } as LanguageModelV2CallWarning,
      ]);

      expect(mockConsoleInfo).not.toHaveBeenCalled();
      expect(mockConsoleWarn).not.toHaveBeenCalled();
      expect(mockProcessEmitWarning).toHaveBeenCalledTimes(3);
      expect(mockProcessEmitWarning).toHaveBeenNthCalledWith(
        1,
        FIRST_WARNING_INFO_MESSAGE,
        { type: 'Warning' },
      );
      expect(mockProcessEmitWarning).toHaveBeenNthCalledWith(
        2,
        'AI SDK Warning: First warning',
        { type: 'Warning' },
      );
      expect(mockProcessEmitWarning).toHaveBeenNthCalledWith(
        3,
        'AI SDK Warning: Second warning',
        { type: 'Warning' },
      );
    });

    it('should emit formatted warnings through the same warning sink', () => {
      const warnings: Warning[] = [
        {
          type: 'unsupported-setting',
          setting: 'size',
          details: 'Size parameter not supported',
        } as ImageModelV2CallWarning,
        {
          type: 'unsupported-tool',
          tool: {
            type: 'function',
            name: 'testTool',
            inputSchema: { type: 'object', properties: {} },
          },
          details: 'Tool not supported',
        } as LanguageModelV2CallWarning,
      ];

      logWarnings(warnings);

      expect(mockConsoleInfo).not.toHaveBeenCalled();
      expect(mockConsoleWarn).not.toHaveBeenCalled();
      expect(mockProcessEmitWarning).toHaveBeenCalledTimes(3);
      expect(mockProcessEmitWarning).toHaveBeenNthCalledWith(
        2,
        'AI SDK Warning: The "size" setting is not supported by this model - Size parameter not supported',
        { type: 'Warning' },
      );
      expect(mockProcessEmitWarning).toHaveBeenNthCalledWith(
        3,
        'AI SDK Warning: The tool "testTool" is not supported by this model - Tool not supported',
        { type: 'Warning' },
      );
    });

    it('should use console.warn for the information note and warnings when process.emitWarning is unavailable', () => {
      const originalProcess = globalThis.process;
      vi.stubGlobal('process', undefined);

      try {
        logWarnings([
          {
            type: 'other',
            message: 'Fallback warning',
          } as LanguageModelV2CallWarning,
        ]);
      } finally {
        vi.stubGlobal('process', originalProcess);
      }

      expect(mockConsoleInfo).not.toHaveBeenCalled();
      expect(mockConsoleWarn).toHaveBeenCalledTimes(2);
      expect(mockConsoleWarn).toHaveBeenNthCalledWith(
        1,
        FIRST_WARNING_INFO_MESSAGE,
      );
      expect(mockConsoleWarn).toHaveBeenNthCalledWith(
        2,
        'AI SDK Warning: Fallback warning',
      );
      expect(mockProcessEmitWarning).not.toHaveBeenCalled();
    });
  });
});
