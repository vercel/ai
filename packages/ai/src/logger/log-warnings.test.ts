import type { SharedV4Warning } from '@ai-sdk/provider';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Warning } from '../types/warning';
import {
  FIRST_WARNING_INFO_MESSAGE,
  logWarnings,
  resetLogWarningsState,
} from './log-warnings';

// Mock console.warn and console.info
const mockConsoleWarn = vi.fn();
const mockConsoleInfo = vi.fn();
vi.stubGlobal('console', { warn: mockConsoleWarn, info: mockConsoleInfo });

// Mock process.emitWarning
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
    beforeEach(() => {
      globalThis.AI_SDK_LOG_WARNINGS = false;
    });

    it('should not log any warnings (single)', () => {
      const warnings: Warning[] = [
        {
          type: 'other',
          message: 'Test warning',
        } as SharedV4Warning,
      ];

      logWarnings({ warnings, provider: 'providerX', model: 'modelY' });

      expect(mockConsoleWarn).not.toHaveBeenCalled();
      expect(mockConsoleInfo).not.toHaveBeenCalled();
    });

    it('should not log any warnings (multiple)', () => {
      const warnings: Warning[] = [
        {
          type: 'other',
          message: 'Test warning 1',
        },
        {
          type: 'other',
          message: 'Test warning 2',
        },
      ];

      logWarnings({ warnings, provider: 'provider', model: 'model' });

      expect(mockConsoleWarn).not.toHaveBeenCalled();
      expect(mockConsoleInfo).not.toHaveBeenCalled();
    });

    it('should not count empty arrays as first call', () => {
      logWarnings({ warnings: [], provider: 'prov', model: 'mod' });

      expect(mockConsoleWarn).not.toHaveBeenCalled();
      expect(mockConsoleInfo).not.toHaveBeenCalled();

      logWarnings({
        warnings: [{ type: 'other', message: 'foo' } as SharedV4Warning],
        provider: 'p1',
        model: 'm1',
      });

      expect(mockConsoleWarn).not.toHaveBeenCalled();
      expect(mockConsoleInfo).not.toHaveBeenCalled();
    });
  });

  describe('when AI_SDK_LOG_WARNINGS is a custom function', () => {
    it('should call the custom function with warning options', () => {
      const customLogger = vi.fn();
      globalThis.AI_SDK_LOG_WARNINGS = customLogger;

      const warnings: Warning[] = [
        {
          type: 'other',
          message: 'Test warning',
        } as SharedV4Warning,
      ];

      const options = { warnings, provider: 'pp', model: 'mm' };
      logWarnings(options);

      expect(customLogger).toHaveBeenCalledOnce();
      expect(customLogger).toHaveBeenCalledWith(options);
      expect(mockConsoleWarn).not.toHaveBeenCalled();
      expect(mockConsoleInfo).not.toHaveBeenCalled();
    });

    it('should call the custom function with multiple warnings', () => {
      const customLogger = vi.fn();
      globalThis.AI_SDK_LOG_WARNINGS = customLogger;

      const warnings: Warning[] = [
        {
          type: 'unsupported',
          feature: 'temperature',
          details: 'Temperature not supported',
        },
        {
          type: 'other',
          message: 'Another warning',
        },
      ];

      const opts = { warnings, provider: 'provider', model: 'model' };
      logWarnings(opts);

      expect(customLogger).toHaveBeenCalledOnce();
      expect(customLogger).toHaveBeenCalledWith(opts);
      expect(mockConsoleWarn).not.toHaveBeenCalled();
      expect(mockConsoleInfo).not.toHaveBeenCalled();
    });

    it('should not call the custom function with empty warnings array', () => {
      const customLogger = vi.fn();
      globalThis.AI_SDK_LOG_WARNINGS = customLogger;

      const warnings: Warning[] = [];

      logWarnings({ warnings, provider: 'x', model: 'y' });

      expect(customLogger).not.toHaveBeenCalled();
      expect(mockConsoleWarn).not.toHaveBeenCalled();
      expect(mockConsoleInfo).not.toHaveBeenCalled();
    });
  });

  describe('when AI_SDK_LOG_WARNINGS is unset/undefined (default behavior)', () => {
    it('should emit the information note and warning via process.emitWarning without logging to stdout', () => {
      const warning: SharedV4Warning = {
        type: 'other',
        message: 'Test warning message',
      };
      const warnings: Warning[] = [warning];

      logWarnings({ warnings, provider: 'myProvider', model: 'myModel' });

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
        'AI SDK Warning (myProvider / myModel): Test warning message',
        { type: 'Warning' },
      );
    });

    it('should only emit the information note on the first non-empty call', () => {
      const first: Warning[] = [
        { type: 'other', message: '1' } as SharedV4Warning,
      ];
      const second: Warning[] = [
        { type: 'other', message: '2' } as SharedV4Warning,
      ];

      logWarnings({ warnings: first, provider: 'a', model: 'b' });
      logWarnings({ warnings: second, provider: 'a', model: 'b' });

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
        'AI SDK Warning (a / b): 1',
        { type: 'Warning' },
      );
      expect(mockProcessEmitWarning).toHaveBeenNthCalledWith(
        3,
        'AI SDK Warning (a / b): 2',
        { type: 'Warning' },
      );
    });

    it('should log the information note and warnings with console.warn when process.emitWarning is unavailable', () => {
      const originalProcess = globalThis.process;
      vi.stubGlobal('process', undefined);

      try {
        logWarnings({
          warnings: [
            { type: 'other', message: 'Test warning' } as SharedV4Warning,
          ],
          provider: 'provider',
          model: 'model',
        });
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
        'AI SDK Warning (provider / model): Test warning',
      );
      expect(mockProcessEmitWarning).not.toHaveBeenCalled();
    });

    it('should only log for non-empty warnings', () => {
      logWarnings({ warnings: [], provider: 'err', model: 'm' });

      expect(mockProcessEmitWarning).not.toHaveBeenCalled();
      expect(mockConsoleInfo).not.toHaveBeenCalled();

      logWarnings({
        warnings: [{ type: 'other', message: 't1' } as SharedV4Warning],
        provider: 'prov',
        model: 'mod',
      });
      expect(mockConsoleInfo).not.toHaveBeenCalled();
      expect(mockProcessEmitWarning).toHaveBeenCalledTimes(2);

      logWarnings({ warnings: [], provider: 'prov', model: 'mod' });
      expect(mockConsoleInfo).not.toHaveBeenCalled();
      expect(mockProcessEmitWarning).toHaveBeenCalledTimes(2);

      logWarnings({
        warnings: [{ type: 'other', message: 't2' } as SharedV4Warning],
        provider: 'prov',
        model: 'mod',
      });
      expect(mockConsoleInfo).not.toHaveBeenCalled();
      expect(mockProcessEmitWarning).toHaveBeenCalledTimes(3);
    });

    it('should handle various warning types per formatWarning', () => {
      const warnings: Warning[] = [
        {
          type: 'unsupported',
          feature: 'mediaType',
          details: 'detail',
        },
        {
          type: 'unsupported',
          feature: 'voice',
          details: 'detail2',
        },
        {
          type: 'deprecated',
          setting: "providerOptions key 'old-key'",
          message: "Use 'oldKey' instead.",
        },
        {
          type: 'other',
          message: 'other msg',
        },
      ];

      logWarnings({ warnings, provider: 'zzz', model: 'MMM' });

      expect(mockConsoleInfo).not.toHaveBeenCalled();
      expect(mockConsoleWarn).not.toHaveBeenCalled();
      expect(mockProcessEmitWarning).toHaveBeenCalledTimes(5);
      expect(mockProcessEmitWarning).toHaveBeenNthCalledWith(
        1,
        FIRST_WARNING_INFO_MESSAGE,
        { type: 'Warning' },
      );
      expect(mockProcessEmitWarning).toHaveBeenNthCalledWith(
        2,
        'AI SDK Warning (zzz / MMM): ' +
          'The feature "mediaType" is not supported. detail',
        { type: 'Warning' },
      );
      expect(mockProcessEmitWarning).toHaveBeenNthCalledWith(
        3,
        'AI SDK Warning (zzz / MMM): ' +
          'The feature "voice" is not supported. detail2',
        { type: 'Warning' },
      );
      expect(mockProcessEmitWarning).toHaveBeenNthCalledWith(
        4,
        `AI SDK Warning (zzz / MMM): Deprecated: "providerOptions key 'old-key'". Use 'oldKey' instead.`,
        { type: 'DeprecationWarning' },
      );
      expect(mockProcessEmitWarning).toHaveBeenNthCalledWith(
        5,
        'AI SDK Warning (zzz / MMM): other msg',
        { type: 'Warning' },
      );
    });

    it('should include warning even with "unknown provider" and "unknown model"', () => {
      logWarnings({
        warnings: [{ type: 'other', message: 'messx' } as SharedV4Warning],
        provider: 'unknown provider',
        model: 'unknown model',
      });

      expect(mockConsoleInfo).not.toHaveBeenCalled();
      expect(mockConsoleWarn).not.toHaveBeenCalled();
      expect(mockProcessEmitWarning).toHaveBeenCalledWith(
        'AI SDK Warning (unknown provider / unknown model): messx',
        { type: 'Warning' },
      );
    });
  });

  describe('when AI_SDK_LOG_WARNINGS is undefined (explicitly set)', () => {
    beforeEach(() => {
      globalThis.AI_SDK_LOG_WARNINGS = undefined;
    });

    it('should use default behavior and emit via process.emitWarning', () => {
      const warning: SharedV4Warning = {
        type: 'other',
        message: 'Test warning with undefined logger',
      };
      const warnings: Warning[] = [warning];

      logWarnings({ warnings, provider: 'p1', model: 'm1' });

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
        'AI SDK Warning (p1 / m1): Test warning with undefined logger',
        { type: 'Warning' },
      );
    });
  });

  describe('first-time information note', () => {
    it('should not display the info message for empty warnings', () => {
      logWarnings({ warnings: [], provider: 'a', model: 'b' });
      expect(mockConsoleInfo).not.toHaveBeenCalled();
      expect(mockConsoleWarn).not.toHaveBeenCalled();
    });

    it('should display informational note only on first real call', () => {
      logWarnings({ warnings: [], provider: 'a', model: 'b' });
      expect(mockConsoleInfo).not.toHaveBeenCalled();
      expect(mockProcessEmitWarning).not.toHaveBeenCalled();

      logWarnings({ warnings: [], provider: 'a', model: 'b' });
      expect(mockConsoleInfo).not.toHaveBeenCalled();
      expect(mockProcessEmitWarning).not.toHaveBeenCalled();

      logWarnings({
        warnings: [{ type: 'other', message: 'foo' } as SharedV4Warning],
        provider: 'abc',
        model: 'bbb',
      });
      expect(mockConsoleInfo).not.toHaveBeenCalled();
      expect(mockProcessEmitWarning).toHaveBeenCalledTimes(2);

      logWarnings({
        warnings: [{ type: 'other', message: 'bar' } as SharedV4Warning],
        provider: 'abc',
        model: 'bbb',
      });
      expect(mockConsoleInfo).not.toHaveBeenCalled();
      expect(mockProcessEmitWarning).toHaveBeenCalledTimes(3);
    });

    it('should not display information note when using custom logger', () => {
      const customLogger = vi.fn();
      globalThis.AI_SDK_LOG_WARNINGS = customLogger;

      logWarnings({
        warnings: [{ type: 'other', message: 'Message' } as SharedV4Warning],
        provider: 'provV',
        model: 'modZ',
      });

      expect(mockConsoleInfo).not.toHaveBeenCalled();
      expect(customLogger).toHaveBeenCalledOnce();
    });

    it('should not display information note when AI_SDK_LOG_WARNINGS is false', () => {
      globalThis.AI_SDK_LOG_WARNINGS = false;

      logWarnings({
        warnings: [
          {
            type: 'other',
            message: 'Suppressed',
          } as SharedV4Warning,
        ],
        provider: 'notProv',
        model: 'notModel',
      });

      expect(mockConsoleInfo).not.toHaveBeenCalled();
      expect(mockConsoleWarn).not.toHaveBeenCalled();
    });
  });
});
