import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  logWarnings,
  resetLogWarningsState,
  FIRST_WARNING_INFO_MESSAGE,
  type Warning,
} from './log-warnings';
import type {
  LanguageModelV3CallWarning,
  ImageModelV3CallWarning,
  SpeechModelV3CallWarning,
  TranscriptionModelV3CallWarning,
} from '@ai-sdk/provider';

// Mock console.warn and console.info
const mockConsoleWarn = vi.fn();
const mockConsoleInfo = vi.fn();
vi.stubGlobal('console', { warn: mockConsoleWarn, info: mockConsoleInfo });

describe('logWarnings', () => {
  beforeEach(() => {
    mockConsoleWarn.mockClear();
    mockConsoleInfo.mockClear();
    resetLogWarningsState();
    delete globalThis.AI_SDK_LOG_WARNINGS;
  });

  afterEach(() => {
    delete globalThis.AI_SDK_LOG_WARNINGS;
  });

  describe('when AI_SDK_LOG_WARNINGS is false', () => {
    beforeEach(() => {
      globalThis.AI_SDK_LOG_WARNINGS = false;
    });

    it('should not log any warnings (single)', () => {
      const warnings: Warning[] = [
        {
          type: 'other',
          message: 'Test warning',
        } as LanguageModelV3CallWarning,
      ];

      logWarnings(warnings);

      expect(mockConsoleWarn).not.toHaveBeenCalled();
      expect(mockConsoleInfo).not.toHaveBeenCalled();
    });

    it('should not log any warnings (multiple)', () => {
      const warnings: Warning[] = [
        {
          type: 'other',
          message: 'Test warning 1',
        } as LanguageModelV3CallWarning,
        {
          type: 'other',
          message: 'Test warning 2',
        } as ImageModelV3CallWarning,
      ];

      logWarnings(warnings);

      expect(mockConsoleWarn).not.toHaveBeenCalled();
      expect(mockConsoleInfo).not.toHaveBeenCalled();
    });

    it('should not count empty arrays as first call', () => {
      logWarnings([]);

      expect(mockConsoleWarn).not.toHaveBeenCalled();
      expect(mockConsoleInfo).not.toHaveBeenCalled();

      logWarnings([
        { type: 'other', message: 'foo' } as LanguageModelV3CallWarning,
      ]);

      expect(mockConsoleWarn).not.toHaveBeenCalled();
      expect(mockConsoleInfo).not.toHaveBeenCalled();
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
        } as LanguageModelV3CallWarning,
      ];

      logWarnings(warnings);

      expect(customLogger).toHaveBeenCalledOnce();
      expect(customLogger).toHaveBeenCalledWith(warnings, undefined);
      expect(mockConsoleWarn).not.toHaveBeenCalled();
      expect(mockConsoleInfo).not.toHaveBeenCalled();
    });

    it('should call the custom function with multiple warnings', () => {
      const customLogger = vi.fn();
      globalThis.AI_SDK_LOG_WARNINGS = customLogger;

      const warnings: Warning[] = [
        {
          type: 'unsupported-setting',
          setting: 'temperature',
          details: 'Temperature not supported',
        } as LanguageModelV3CallWarning,
        {
          type: 'other',
          message: 'Another warning',
        } as ImageModelV3CallWarning,
      ];

      logWarnings(warnings);

      expect(customLogger).toHaveBeenCalledOnce();
      expect(customLogger).toHaveBeenCalledWith(warnings, undefined);
      expect(mockConsoleWarn).not.toHaveBeenCalled();
      expect(mockConsoleInfo).not.toHaveBeenCalled();
    });

    it('should not call the custom function with empty warnings array', () => {
      const customLogger = vi.fn();
      globalThis.AI_SDK_LOG_WARNINGS = customLogger;

      const warnings: Warning[] = [];

      logWarnings(warnings);

      expect(customLogger).not.toHaveBeenCalled();
      expect(mockConsoleWarn).not.toHaveBeenCalled();
      expect(mockConsoleInfo).not.toHaveBeenCalled();
    });
  });

  describe('when AI_SDK_LOG_WARNINGS is unset/undefined (default behavior)', () => {
    it('should show console.info once for first warning(s), then log to console.warn for each warning', () => {
      const warning: LanguageModelV3CallWarning = {
        type: 'other',
        message: 'Test warning message',
      };
      const warnings: Warning[] = [warning];

      logWarnings(warnings);

      expect(mockConsoleInfo).toHaveBeenCalledTimes(1);
      expect(mockConsoleInfo).toHaveBeenCalledWith(FIRST_WARNING_INFO_MESSAGE);
      expect(mockConsoleWarn).toHaveBeenCalledTimes(1);
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        'AI SDK Warning (unknown provider / unknown model): Test warning message',
      );
    });

    it('should only show console.info on the first non-empty call', () => {
      const first: Warning[] = [
        { type: 'other', message: '1' } as LanguageModelV3CallWarning,
      ];
      const second: Warning[] = [
        { type: 'other', message: '2' } as LanguageModelV3CallWarning,
      ];

      logWarnings(first);
      logWarnings(second);

      // Info on first call only
      expect(mockConsoleInfo).toHaveBeenCalledTimes(1);
      expect(mockConsoleInfo).toHaveBeenCalledWith(FIRST_WARNING_INFO_MESSAGE);
      expect(mockConsoleWarn).toHaveBeenCalledTimes(2);
      expect(mockConsoleWarn).toHaveBeenNthCalledWith(
        1,
        'AI SDK Warning (unknown provider / unknown model): 1',
      );
      expect(mockConsoleWarn).toHaveBeenNthCalledWith(
        2,
        'AI SDK Warning (unknown provider / unknown model): 2',
      );
    });

    it('should only log for non-empty warnings', () => {
      logWarnings([]);

      expect(mockConsoleWarn).not.toHaveBeenCalled();
      expect(mockConsoleInfo).not.toHaveBeenCalled();

      logWarnings([
        { type: 'other', message: 't1' } as LanguageModelV3CallWarning,
      ]);
      expect(mockConsoleInfo).toHaveBeenCalledOnce();
      expect(mockConsoleWarn).toHaveBeenCalledOnce();

      logWarnings([]);
      expect(mockConsoleInfo).toHaveBeenCalledOnce();
      expect(mockConsoleWarn).toHaveBeenCalledOnce();

      logWarnings([
        { type: 'other', message: 't2' } as LanguageModelV3CallWarning,
      ]);
      expect(mockConsoleInfo).toHaveBeenCalledOnce(); // only once
      expect(mockConsoleWarn).toHaveBeenCalledTimes(2);
    });

    it('should handle various warning types per formatWarning', () => {
      const warnings: Warning[] = [
        {
          type: 'unsupported-setting',
          setting: 'mediaType',
          details: 'detail',
        } as TranscriptionModelV3CallWarning,
        {
          type: 'unsupported-setting',
          setting: 'voice',
          details: 'detail2',
        } as SpeechModelV3CallWarning,
        {
          type: 'unsupported-tool',
          tool: {
            type: 'function',
            name: 'n',
            inputSchema: { type: 'object', properties: {} },
          },
          details: 'detail3',
        } as LanguageModelV3CallWarning,
        {
          type: 'other',
          message: 'other msg',
        } as ImageModelV3CallWarning,
      ];

      logWarnings(warnings);

      expect(mockConsoleInfo).toHaveBeenCalledTimes(1);
      expect(mockConsoleWarn).toHaveBeenCalledTimes(4);
      expect(mockConsoleWarn).toHaveBeenNthCalledWith(
        1,
        'AI SDK Warning (unknown provider / unknown model): ' +
          'The "mediaType" setting is not supported. detail',
      );
      expect(mockConsoleWarn).toHaveBeenNthCalledWith(
        2,
        'AI SDK Warning (unknown provider / unknown model): ' +
          'The "voice" setting is not supported. detail2',
      );
      expect(mockConsoleWarn).toHaveBeenNthCalledWith(
        3,
        'AI SDK Warning (unknown provider / unknown model): ' +
          'The tool "n" is not supported. detail3',
      );
      expect(mockConsoleWarn).toHaveBeenNthCalledWith(
        4,
        'AI SDK Warning (unknown provider / unknown model): other msg',
      );
    });
  });

  describe('when AI_SDK_LOG_WARNINGS is undefined (explicitly set)', () => {
    beforeEach(() => {
      globalThis.AI_SDK_LOG_WARNINGS = undefined;
    });

    it('should use default behavior and log to console.warn', () => {
      const warning: LanguageModelV3CallWarning = {
        type: 'other',
        message: 'Test warning with undefined logger',
      };
      const warnings: Warning[] = [warning];

      logWarnings(warnings);

      expect(mockConsoleInfo).toHaveBeenCalledOnce();
      expect(mockConsoleInfo).toHaveBeenCalledWith(FIRST_WARNING_INFO_MESSAGE);
      expect(mockConsoleWarn).toHaveBeenCalledOnce();
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        'AI SDK Warning (unknown provider / unknown model): Test warning with undefined logger',
      );
    });
  });

  describe('first-time information note', () => {
    it('should not display the info message for empty warnings', () => {
      logWarnings([]);
      expect(mockConsoleInfo).not.toHaveBeenCalled();
      expect(mockConsoleWarn).not.toHaveBeenCalled();
    });

    it('should display informational note only on first real call', () => {
      logWarnings([]);
      expect(mockConsoleInfo).not.toHaveBeenCalled();
      expect(mockConsoleWarn).not.toHaveBeenCalled();

      logWarnings([]);
      expect(mockConsoleInfo).not.toHaveBeenCalled();
      expect(mockConsoleWarn).not.toHaveBeenCalled();

      logWarnings([
        { type: 'other', message: 'foo' } as LanguageModelV3CallWarning,
      ]);
      expect(mockConsoleInfo).toHaveBeenCalledTimes(1);
      expect(mockConsoleWarn).toHaveBeenCalledTimes(1);

      logWarnings([
        { type: 'other', message: 'bar' } as LanguageModelV3CallWarning,
      ]);
      expect(mockConsoleInfo).toHaveBeenCalledTimes(1);
      expect(mockConsoleWarn).toHaveBeenCalledTimes(2);
    });

    it('should not display information note when using custom logger', () => {
      const customLogger = vi.fn();
      globalThis.AI_SDK_LOG_WARNINGS = customLogger;

      logWarnings([
        { type: 'other', message: 'Message' } as LanguageModelV3CallWarning,
      ]);

      expect(mockConsoleInfo).not.toHaveBeenCalled();
      expect(customLogger).toHaveBeenCalledOnce();
    });

    it('should not display information note when AI_SDK_LOG_WARNINGS is false', () => {
      globalThis.AI_SDK_LOG_WARNINGS = false;

      logWarnings([
        { type: 'other', message: 'Suppressed' } as LanguageModelV3CallWarning,
      ]);

      expect(mockConsoleInfo).not.toHaveBeenCalled();
      expect(mockConsoleWarn).not.toHaveBeenCalled();
    });
  });
});
