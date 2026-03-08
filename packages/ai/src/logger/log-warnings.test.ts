import type { SharedV3Warning } from '@ai-sdk/provider';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Warning } from '../types/warning';
import {
  FIRST_WARNING_INFO_MESSAGE,
  logWarnings,
  resetLogWarningsState,
} from './log-warnings';

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
        } as SharedV3Warning,
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
        warnings: [{ type: 'other', message: 'foo' } as SharedV3Warning],
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
        } as SharedV3Warning,
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
    it('should show console.info once for first warning(s), then log to console.warn for each warning', () => {
      const warning: SharedV3Warning = {
        type: 'other',
        message: 'Test warning message',
      };
      const warnings: Warning[] = [warning];

      logWarnings({ warnings, provider: 'myProvider', model: 'myModel' });

      expect(mockConsoleInfo).toHaveBeenCalledTimes(1);
      expect(mockConsoleInfo).toHaveBeenCalledWith(FIRST_WARNING_INFO_MESSAGE);
      expect(mockConsoleWarn).toHaveBeenCalledTimes(1);
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        'AI SDK Warning (myProvider / myModel): Test warning message',
      );
    });

    it('should only show console.info on the first non-empty call', () => {
      const first: Warning[] = [
        { type: 'other', message: '1' } as SharedV3Warning,
      ];
      const second: Warning[] = [
        { type: 'other', message: '2' } as SharedV3Warning,
      ];

      logWarnings({ warnings: first, provider: 'a', model: 'b' });
      logWarnings({ warnings: second, provider: 'a', model: 'b' });

      // Info on first call only
      expect(mockConsoleInfo).toHaveBeenCalledTimes(1);
      expect(mockConsoleInfo).toHaveBeenCalledWith(FIRST_WARNING_INFO_MESSAGE);
      expect(mockConsoleWarn).toHaveBeenCalledTimes(2);
      expect(mockConsoleWarn).toHaveBeenNthCalledWith(
        1,
        'AI SDK Warning (a / b): 1',
      );
      expect(mockConsoleWarn).toHaveBeenNthCalledWith(
        2,
        'AI SDK Warning (a / b): 2',
      );
    });

    it('should only log for non-empty warnings', () => {
      logWarnings({ warnings: [], provider: 'err', model: 'm' });

      expect(mockConsoleWarn).not.toHaveBeenCalled();
      expect(mockConsoleInfo).not.toHaveBeenCalled();

      logWarnings({
        warnings: [{ type: 'other', message: 't1' } as SharedV3Warning],
        provider: 'prov',
        model: 'mod',
      });
      expect(mockConsoleInfo).toHaveBeenCalledOnce();
      expect(mockConsoleWarn).toHaveBeenCalledOnce();

      logWarnings({ warnings: [], provider: 'prov', model: 'mod' });
      expect(mockConsoleInfo).toHaveBeenCalledOnce();
      expect(mockConsoleWarn).toHaveBeenCalledOnce();

      logWarnings({
        warnings: [{ type: 'other', message: 't2' } as SharedV3Warning],
        provider: 'prov',
        model: 'mod',
      });
      expect(mockConsoleInfo).toHaveBeenCalledOnce(); // only once
      expect(mockConsoleWarn).toHaveBeenCalledTimes(2);
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
          type: 'other',
          message: 'other msg',
        },
      ];

      logWarnings({ warnings, provider: 'zzz', model: 'MMM' });

      expect(mockConsoleInfo).toHaveBeenCalledTimes(1);
      expect(mockConsoleWarn).toHaveBeenCalledTimes(3);
      expect(mockConsoleWarn).toHaveBeenNthCalledWith(
        1,
        'AI SDK Warning (zzz / MMM): ' +
          'The feature "mediaType" is not supported. detail',
      );
      expect(mockConsoleWarn).toHaveBeenNthCalledWith(
        2,
        'AI SDK Warning (zzz / MMM): ' +
          'The feature "voice" is not supported. detail2',
      );
      expect(mockConsoleWarn).toHaveBeenNthCalledWith(
        3,
        'AI SDK Warning (zzz / MMM): other msg',
      );
    });

    it('should include warning even with "unknown provider" and "unknown model"', () => {
      logWarnings({
        warnings: [{ type: 'other', message: 'messx' } as SharedV3Warning],
        provider: 'unknown provider',
        model: 'unknown model',
      });

      expect(mockConsoleInfo).toHaveBeenCalledTimes(1);
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        'AI SDK Warning (unknown provider / unknown model): messx',
      );
    });
  });

  describe('when AI_SDK_LOG_WARNINGS is undefined (explicitly set)', () => {
    beforeEach(() => {
      globalThis.AI_SDK_LOG_WARNINGS = undefined;
    });

    it('should use default behavior and log to console.warn', () => {
      const warning: SharedV3Warning = {
        type: 'other',
        message: 'Test warning with undefined logger',
      };
      const warnings: Warning[] = [warning];

      logWarnings({ warnings, provider: 'p1', model: 'm1' });

      expect(mockConsoleInfo).toHaveBeenCalledOnce();
      expect(mockConsoleInfo).toHaveBeenCalledWith(FIRST_WARNING_INFO_MESSAGE);
      expect(mockConsoleWarn).toHaveBeenCalledOnce();
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        'AI SDK Warning (p1 / m1): Test warning with undefined logger',
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
      expect(mockConsoleWarn).not.toHaveBeenCalled();

      logWarnings({ warnings: [], provider: 'a', model: 'b' });
      expect(mockConsoleInfo).not.toHaveBeenCalled();
      expect(mockConsoleWarn).not.toHaveBeenCalled();

      logWarnings({
        warnings: [{ type: 'other', message: 'foo' } as SharedV3Warning],
        provider: 'abc',
        model: 'bbb',
      });
      expect(mockConsoleInfo).toHaveBeenCalledTimes(1);
      expect(mockConsoleWarn).toHaveBeenCalledTimes(1);

      logWarnings({
        warnings: [{ type: 'other', message: 'bar' } as SharedV3Warning],
        provider: 'abc',
        model: 'bbb',
      });
      expect(mockConsoleInfo).toHaveBeenCalledTimes(1);
      expect(mockConsoleWarn).toHaveBeenCalledTimes(2);
    });

    it('should not display information note when using custom logger', () => {
      const customLogger = vi.fn();
      globalThis.AI_SDK_LOG_WARNINGS = customLogger;

      logWarnings({
        warnings: [{ type: 'other', message: 'Message' } as SharedV3Warning],
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
          } as SharedV3Warning,
        ],
        provider: 'notProv',
        model: 'notModel',
      });

      expect(mockConsoleInfo).not.toHaveBeenCalled();
      expect(mockConsoleWarn).not.toHaveBeenCalled();
    });
  });
});
