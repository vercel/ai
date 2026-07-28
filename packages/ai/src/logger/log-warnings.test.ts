import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  logWarnings,
  resetLogWarningsState,
  FIRST_WARNING_INFO_MESSAGE,
  type Warning,
} from './log-warnings';
import type {
  LanguageModelV2CallWarning,
  ImageModelV2CallWarning,
  SpeechModelV2CallWarning,
  TranscriptionModelV2CallWarning,
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
  });

  afterEach(() => {
    delete globalThis.AI_SDK_LOG_WARNINGS;
  });

  describe('when AI_SDK_LOG_WARNINGS is false', () => {
    beforeEach(() => {
      globalThis.AI_SDK_LOG_WARNINGS = false;
    });

    it('should not log any warnings', () => {
      const warnings: Warning[] = [
        {
          type: 'other',
          message: 'Test warning',
        } as LanguageModelV2CallWarning,
      ];

      logWarnings(warnings);

      expect(mockConsoleWarn).not.toHaveBeenCalled();
    });

    it('should not log multiple warnings', () => {
      const warnings: Warning[] = [
        {
          type: 'other',
          message: 'Test warning 1',
        } as LanguageModelV2CallWarning,
        {
          type: 'other',
          message: 'Test warning 2',
        } as ImageModelV2CallWarning,
      ];

      logWarnings(warnings);

      expect(mockConsoleWarn).not.toHaveBeenCalled();
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
      expect(mockConsoleWarn).not.toHaveBeenCalled();
    });

    it('should call the custom function with multiple warnings', () => {
      const customLogger = vi.fn();
      globalThis.AI_SDK_LOG_WARNINGS = customLogger;

      const warnings: Warning[] = [
        {
          type: 'unsupported-setting',
          setting: 'temperature',
          details: 'Temperature not supported',
        } as LanguageModelV2CallWarning,
        {
          type: 'other',
          message: 'Another warning',
        } as ImageModelV2CallWarning,
      ];

      logWarnings(warnings);

      expect(customLogger).toHaveBeenCalledOnce();
      expect(customLogger).toHaveBeenCalledWith(warnings);
      expect(mockConsoleWarn).not.toHaveBeenCalled();
    });

    it('should not call the custom function with empty warnings array', () => {
      const customLogger = vi.fn();
      globalThis.AI_SDK_LOG_WARNINGS = customLogger;

      const warnings: Warning[] = [];

      logWarnings(warnings);

      expect(customLogger).not.toHaveBeenCalled();
      expect(mockConsoleWarn).not.toHaveBeenCalled();
    });
  });

<<<<<<< HEAD
  describe('when AI_SDK_LOG_WARNINGS is not set (default behavior)', () => {
    it('should log a single warning to console.warn', () => {
      const warning: LanguageModelV2CallWarning = {
=======
  describe('when AI_SDK_LOG_WARNINGS is unset/undefined (default behavior)', () => {
    it('should emit the information note and warning via process.emitWarning without logging to stdout', () => {
      const warning: SharedV4Warning = {
>>>>>>> 2e2224b3c4 (fix: prevent the warning system banner from corrupting stdout output (#17973))
        type: 'other',
        message: 'Test warning message',
      };
      const warnings: Warning[] = [warning];

      logWarnings(warnings);

<<<<<<< HEAD
      expect(mockConsoleInfo).toHaveBeenCalledOnce(); // Information note on first call
      expect(mockConsoleWarn).toHaveBeenCalledOnce();
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        'AI SDK Warning: Test warning message',
      );
    });

    it('should log multiple warnings to console.warn', () => {
      const warning1: LanguageModelV2CallWarning = {
        type: 'other',
        message: 'First warning',
      };
      const warning2: ImageModelV2CallWarning = {
        type: 'unsupported-setting',
        setting: 'size',
        details: 'Size parameter not supported',
      };
      const warnings: Warning[] = [warning1, warning2];
=======
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
>>>>>>> 2e2224b3c4 (fix: prevent the warning system banner from corrupting stdout output (#17973))

      logWarnings(warnings);

<<<<<<< HEAD
      expect(mockConsoleInfo).toHaveBeenCalledOnce(); // Information note on first call
      expect(mockConsoleWarn).toHaveBeenCalledTimes(2);
      expect(mockConsoleWarn).toHaveBeenNthCalledWith(
        1,
        'AI SDK Warning: First warning',
=======
      expect(mockConsoleInfo).not.toHaveBeenCalled();
      expect(mockConsoleWarn).not.toHaveBeenCalled();
      expect(mockProcessEmitWarning).toHaveBeenCalledTimes(3);
      expect(mockProcessEmitWarning).toHaveBeenNthCalledWith(
        1,
        FIRST_WARNING_INFO_MESSAGE,
        { type: 'Warning' },
>>>>>>> 2e2224b3c4 (fix: prevent the warning system banner from corrupting stdout output (#17973))
      );
      expect(mockConsoleWarn).toHaveBeenNthCalledWith(
        2,
<<<<<<< HEAD
        'AI SDK Warning: The "size" setting is not supported by this model - Size parameter not supported',
      );
    });

    it('should not log anything when warnings array is empty', () => {
      const warnings: Warning[] = [];
=======
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
>>>>>>> 2e2224b3c4 (fix: prevent the warning system banner from corrupting stdout output (#17973))

      logWarnings(warnings);

<<<<<<< HEAD
      expect(mockConsoleInfo).not.toHaveBeenCalled(); // No information note with empty array
      expect(mockConsoleWarn).not.toHaveBeenCalled();
=======
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
>>>>>>> 2e2224b3c4 (fix: prevent the warning system banner from corrupting stdout output (#17973))
    });

    describe('with different warning types', () => {
      it('should log LanguageModelV2CallWarning with unsupported-setting type', () => {
        const warning: LanguageModelV2CallWarning = {
          type: 'unsupported-setting',
          setting: 'temperature',
          details: 'Temperature setting is not supported by this model',
        };
        const warnings: Warning[] = [warning];

        logWarnings(warnings);

        expect(mockConsoleInfo).toHaveBeenCalledOnce(); // Information note on first call
        expect(mockConsoleWarn).toHaveBeenCalledOnce();
        expect(mockConsoleWarn).toHaveBeenCalledWith(
          'AI SDK Warning: The "temperature" setting is not supported by this model - Temperature setting is not supported by this model',
        );
      });

      it('should log LanguageModelV2CallWarning with unsupported-tool type', () => {
        const warning: LanguageModelV2CallWarning = {
          type: 'unsupported-tool',
          tool: {
            type: 'function',
            name: 'testTool',
            inputSchema: { type: 'object', properties: {} },
          },
          details: 'Tool not supported',
        };
        const warnings: Warning[] = [warning];

        logWarnings(warnings);

        expect(mockConsoleInfo).toHaveBeenCalledOnce(); // Information note on first call
        expect(mockConsoleWarn).toHaveBeenCalledOnce();
        expect(mockConsoleWarn).toHaveBeenCalledWith(
          'AI SDK Warning: The tool "testTool" is not supported by this model - Tool not supported',
        );
      });

      it('should log ImageModelV2CallWarning', () => {
        const warning: ImageModelV2CallWarning = {
          type: 'unsupported-setting',
          setting: 'size',
          details: 'Image size setting not supported',
        };
        const warnings: Warning[] = [warning];

        logWarnings(warnings);

        expect(mockConsoleInfo).toHaveBeenCalledOnce(); // Information note on first call
        expect(mockConsoleWarn).toHaveBeenCalledOnce();
        expect(mockConsoleWarn).toHaveBeenCalledWith(
          'AI SDK Warning: The "size" setting is not supported by this model - Image size setting not supported',
        );
      });

      it('should log SpeechModelV2CallWarning', () => {
        const warning: SpeechModelV2CallWarning = {
          type: 'unsupported-setting',
          setting: 'voice',
          details: 'Voice setting not supported',
        };
        const warnings: Warning[] = [warning];

        logWarnings(warnings);

        expect(mockConsoleInfo).toHaveBeenCalledOnce(); // Information note on first call
        expect(mockConsoleWarn).toHaveBeenCalledOnce();
        expect(mockConsoleWarn).toHaveBeenCalledWith(
          'AI SDK Warning: The "voice" setting is not supported by this model - Voice setting not supported',
        );
      });

      it('should log TranscriptionModelV2CallWarning', () => {
        const warning: TranscriptionModelV2CallWarning = {
          type: 'unsupported-setting',
          setting: 'mediaType',
          details: 'MediaType setting not supported',
        };
        const warnings: Warning[] = [warning];

        logWarnings(warnings);

        expect(mockConsoleInfo).toHaveBeenCalledOnce(); // Information note on first call
        expect(mockConsoleWarn).toHaveBeenCalledOnce();
        expect(mockConsoleWarn).toHaveBeenCalledWith(
          'AI SDK Warning: The "mediaType" setting is not supported by this model - MediaType setting not supported',
        );
      });

      it('should log mixed warning types', () => {
        const languageWarning: LanguageModelV2CallWarning = {
          type: 'other',
          message: 'Language model warning',
        };
        const imageWarning: ImageModelV2CallWarning = {
          type: 'other',
          message: 'Image model warning',
        };
        const speechWarning: SpeechModelV2CallWarning = {
          type: 'other',
          message: 'Speech model warning',
        };
        const transcriptionWarning: TranscriptionModelV2CallWarning = {
          type: 'other',
          message: 'Transcription model warning',
        };

        const warnings: Warning[] = [
          languageWarning,
          imageWarning,
          speechWarning,
          transcriptionWarning,
        ];

<<<<<<< HEAD
        logWarnings(warnings);
=======
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
>>>>>>> 2e2224b3c4 (fix: prevent the warning system banner from corrupting stdout output (#17973))

        expect(mockConsoleInfo).toHaveBeenCalledOnce(); // Information note on first call
        expect(mockConsoleWarn).toHaveBeenCalledTimes(4);
        expect(mockConsoleWarn).toHaveBeenNthCalledWith(
          1,
          'AI SDK Warning: Language model warning',
        );
        expect(mockConsoleWarn).toHaveBeenNthCalledWith(
          2,
          'AI SDK Warning: Image model warning',
        );
        expect(mockConsoleWarn).toHaveBeenNthCalledWith(
          3,
          'AI SDK Warning: Speech model warning',
        );
        expect(mockConsoleWarn).toHaveBeenNthCalledWith(
          4,
          'AI SDK Warning: Transcription model warning',
        );
      });
<<<<<<< HEAD
=======

      expect(mockConsoleInfo).not.toHaveBeenCalled();
      expect(mockConsoleWarn).not.toHaveBeenCalled();
      expect(mockProcessEmitWarning).toHaveBeenCalledWith(
        'AI SDK Warning (unknown provider / unknown model): messx',
        { type: 'Warning' },
      );
>>>>>>> 2e2224b3c4 (fix: prevent the warning system banner from corrupting stdout output (#17973))
    });
  });

  describe('when AI_SDK_LOG_WARNINGS is undefined (explicitly set)', () => {
    beforeEach(() => {
      globalThis.AI_SDK_LOG_WARNINGS = undefined;
    });

    it('should use default behavior and log to console.warn', () => {
      const warning: LanguageModelV2CallWarning = {
        type: 'other',
        message: 'Test warning with undefined logger',
      };
      const warnings: Warning[] = [warning];

      logWarnings(warnings);

<<<<<<< HEAD
      expect(mockConsoleInfo).toHaveBeenCalledOnce(); // Information note on first call
      expect(mockConsoleWarn).toHaveBeenCalledOnce();
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        'AI SDK Warning: Test warning with undefined logger',
=======
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
>>>>>>> 2e2224b3c4 (fix: prevent the warning system banner from corrupting stdout output (#17973))
      );
    });
  });

  describe('first-time information note', () => {
    describe('when using default console behavior', () => {
      it('should display information note on first call', () => {
        const warning: LanguageModelV2CallWarning = {
          type: 'other',
          message: 'First warning',
        };
        const warnings: Warning[] = [warning];

        logWarnings(warnings);

        expect(mockConsoleInfo).toHaveBeenCalledOnce();
        expect(mockConsoleInfo).toHaveBeenCalledWith(
          FIRST_WARNING_INFO_MESSAGE,
        );
        expect(mockConsoleWarn).toHaveBeenCalledOnce();
        expect(mockConsoleWarn).toHaveBeenCalledWith(
          'AI SDK Warning: First warning',
        );
      });

      it('should not display information note on subsequent calls', () => {
        const warning1: LanguageModelV2CallWarning = {
          type: 'other',
          message: 'First warning',
        };
        const warning2: LanguageModelV2CallWarning = {
          type: 'other',
          message: 'Second warning',
        };

        // First call
        logWarnings([warning1]);

        // Second call
        logWarnings([warning2]);

        // Info should only be called once (on first call)
        expect(mockConsoleInfo).toHaveBeenCalledOnce();
        expect(mockConsoleInfo).toHaveBeenCalledWith(
          FIRST_WARNING_INFO_MESSAGE,
        );

        // Warnings should be called twice
        expect(mockConsoleWarn).toHaveBeenCalledTimes(2);
        expect(mockConsoleWarn).toHaveBeenNthCalledWith(
          1,
          'AI SDK Warning: First warning',
        );
        expect(mockConsoleWarn).toHaveBeenNthCalledWith(
          2,
          'AI SDK Warning: Second warning',
        );
      });

      it('should not display information note with empty warnings array', () => {
        const warnings: Warning[] = [];

        logWarnings(warnings);

        expect(mockConsoleInfo).not.toHaveBeenCalled();
        expect(mockConsoleWarn).not.toHaveBeenCalled();
      });

      it('should not count empty arrays towards first call', () => {
        // First call with empty array should not trigger info message
        const emptyWarnings: Warning[] = [];
        logWarnings(emptyWarnings);

        expect(mockConsoleInfo).not.toHaveBeenCalled();
        expect(mockConsoleWarn).not.toHaveBeenCalled();

        // Second call with actual warning should trigger info message (as it's the "first" real call)
        const warning: LanguageModelV2CallWarning = {
          type: 'other',
          message: 'Test warning',
        };
        const warnings: Warning[] = [warning];
        logWarnings(warnings);

        expect(mockConsoleInfo).toHaveBeenCalledOnce();
        expect(mockConsoleInfo).toHaveBeenCalledWith(
          FIRST_WARNING_INFO_MESSAGE,
        );
        expect(mockConsoleWarn).toHaveBeenCalledOnce();
        expect(mockConsoleWarn).toHaveBeenCalledWith(
          'AI SDK Warning: Test warning',
        );
      });
    });

    describe('when using custom logger function', () => {
      it('should not display information note with custom logger', () => {
        const customLogger = vi.fn();
        globalThis.AI_SDK_LOG_WARNINGS = customLogger;

        const warning: LanguageModelV2CallWarning = {
          type: 'other',
          message: 'Test warning',
        };
        const warnings: Warning[] = [warning];

        logWarnings(warnings);

        expect(mockConsoleInfo).not.toHaveBeenCalled();
        expect(customLogger).toHaveBeenCalledOnce();
        expect(customLogger).toHaveBeenCalledWith(warnings);
      });
<<<<<<< HEAD
=======
      expect(mockConsoleInfo).not.toHaveBeenCalled();
      expect(mockProcessEmitWarning).toHaveBeenCalledTimes(2);

      logWarnings({
        warnings: [{ type: 'other', message: 'bar' } as SharedV4Warning],
        provider: 'abc',
        model: 'bbb',
      });
      expect(mockConsoleInfo).not.toHaveBeenCalled();
      expect(mockProcessEmitWarning).toHaveBeenCalledTimes(3);
>>>>>>> 2e2224b3c4 (fix: prevent the warning system banner from corrupting stdout output (#17973))
    });

    describe('when AI_SDK_LOG_WARNINGS is false', () => {
      beforeEach(() => {
        globalThis.AI_SDK_LOG_WARNINGS = false;
      });

      it('should not display information note when logging is disabled', () => {
        const warning: LanguageModelV2CallWarning = {
          type: 'other',
          message: 'Test warning',
        };
        const warnings: Warning[] = [warning];

        logWarnings(warnings);

        expect(mockConsoleInfo).not.toHaveBeenCalled();
        expect(mockConsoleWarn).not.toHaveBeenCalled();
      });
    });
  });
});
