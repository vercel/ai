import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { logWarnings, type Warning } from './log-warnings';
import type {
  LanguageModelV2CallWarning,
  ImageModelV2CallWarning,
  SpeechModelV2CallWarning,
  TranscriptionModelV2CallWarning,
} from '@ai-sdk/provider';

// Mock console.warn
const mockConsoleWarn = vi.fn();
vi.stubGlobal('console', { warn: mockConsoleWarn });

describe('logWarnings', () => {
  beforeEach(() => {
    mockConsoleWarn.mockClear();
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

    it('should call the custom function with empty warnings array', () => {
      const customLogger = vi.fn();
      globalThis.AI_SDK_LOG_WARNINGS = customLogger;

      const warnings: Warning[] = [];

      logWarnings(warnings);

      expect(customLogger).toHaveBeenCalledOnce();
      expect(customLogger).toHaveBeenCalledWith(warnings);
      expect(mockConsoleWarn).not.toHaveBeenCalled();
    });
  });

  describe('when AI_SDK_LOG_WARNINGS is not set (default behavior)', () => {
    it('should log a single warning to console.warn', () => {
      const warning: LanguageModelV2CallWarning = {
        type: 'other',
        message: 'Test warning message',
      };
      const warnings: Warning[] = [warning];

      logWarnings(warnings);

      expect(mockConsoleWarn).toHaveBeenCalledOnce();
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        JSON.stringify(warning, null, 2),
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

      logWarnings(warnings);

      expect(mockConsoleWarn).toHaveBeenCalledTimes(2);
      expect(mockConsoleWarn).toHaveBeenNthCalledWith(
        1,
        JSON.stringify(warning1, null, 2),
      );
      expect(mockConsoleWarn).toHaveBeenNthCalledWith(
        2,
        JSON.stringify(warning2, null, 2),
      );
    });

    it('should not log anything when warnings array is empty', () => {
      const warnings: Warning[] = [];

      logWarnings(warnings);

      expect(mockConsoleWarn).not.toHaveBeenCalled();
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

        expect(mockConsoleWarn).toHaveBeenCalledOnce();
        expect(mockConsoleWarn).toHaveBeenCalledWith(
          JSON.stringify(warning, null, 2),
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

        expect(mockConsoleWarn).toHaveBeenCalledOnce();
        expect(mockConsoleWarn).toHaveBeenCalledWith(
          JSON.stringify(warning, null, 2),
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

        expect(mockConsoleWarn).toHaveBeenCalledOnce();
        expect(mockConsoleWarn).toHaveBeenCalledWith(
          JSON.stringify(warning, null, 2),
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

        expect(mockConsoleWarn).toHaveBeenCalledOnce();
        expect(mockConsoleWarn).toHaveBeenCalledWith(
          JSON.stringify(warning, null, 2),
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

        expect(mockConsoleWarn).toHaveBeenCalledOnce();
        expect(mockConsoleWarn).toHaveBeenCalledWith(
          JSON.stringify(warning, null, 2),
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

        logWarnings(warnings);

        expect(mockConsoleWarn).toHaveBeenCalledTimes(4);
        expect(mockConsoleWarn).toHaveBeenNthCalledWith(
          1,
          JSON.stringify(languageWarning, null, 2),
        );
        expect(mockConsoleWarn).toHaveBeenNthCalledWith(
          2,
          JSON.stringify(imageWarning, null, 2),
        );
        expect(mockConsoleWarn).toHaveBeenNthCalledWith(
          3,
          JSON.stringify(speechWarning, null, 2),
        );
        expect(mockConsoleWarn).toHaveBeenNthCalledWith(
          4,
          JSON.stringify(transcriptionWarning, null, 2),
        );
      });
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

      expect(mockConsoleWarn).toHaveBeenCalledOnce();
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        JSON.stringify(warning, null, 2),
      );
    });
  });
});
