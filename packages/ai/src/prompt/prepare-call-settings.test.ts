import { InvalidArgumentError } from '../error/invalid-argument-error';
import { prepareCallSettings } from './prepare-call-settings';

describe('prepareCallSettings', () => {
  describe('valid inputs', () => {
    it('should not throw an error for valid settings', () => {
      const validSettings = {
        maxOutputTokens: 100,
        temperature: 0.7,
        topP: 0.9,
        topK: 50,
        presencePenalty: 0.5,
        frequencyPenalty: 0.3,
        seed: 42,
        // stopSequences is not validated by validateCallSettings
      };

      expect(() => prepareCallSettings(validSettings)).not.toThrow();
    });

    it('should allow undefined values for optional settings', () => {
      const validSettings = {
        maxOutputTokens: undefined,
        temperature: undefined,
        topP: undefined,
        topK: undefined,
        presencePenalty: undefined,
        frequencyPenalty: undefined,
        seed: undefined,
      };

      expect(() => prepareCallSettings(validSettings)).not.toThrow();
    });
  });

  describe('invalid inputs', () => {
    describe('maxOutputTokens', () => {
      it('should throw InvalidArgumentError if maxOutputTokens is not an integer', () => {
        expect(() => prepareCallSettings({ maxOutputTokens: 10.5 })).toThrow(
          new InvalidArgumentError({
            parameter: 'maxOutputTokens',
            value: 10.5,
            message: 'maxOutputTokens must be an integer',
          }),
        );
      });

      it('should throw InvalidArgumentError if maxOutputTokens is less than 1', () => {
        expect(() => prepareCallSettings({ maxOutputTokens: 0 })).toThrow(
          new InvalidArgumentError({
            parameter: 'maxOutputTokens',
            value: 0,
            message: 'maxOutputTokens must be >= 1',
          }),
        );
      });
    });

    describe('temperature', () => {
      it('should throw InvalidArgumentError if temperature is not a number', () => {
        expect(() =>
          prepareCallSettings({ temperature: 'invalid' as any }),
        ).toThrow(
          new InvalidArgumentError({
            parameter: 'temperature',
            value: 'invalid',
            message: 'temperature must be a number',
          }),
        );
      });
    });

    describe('topP', () => {
      it('should throw InvalidArgumentError if topP is not a number', () => {
        expect(() => prepareCallSettings({ topP: 'invalid' as any })).toThrow(
          new InvalidArgumentError({
            parameter: 'topP',
            value: 'invalid',
            message: 'topP must be a number',
          }),
        );
      });
    });

    describe('topK', () => {
      it('should throw InvalidArgumentError if topK is not a number', () => {
        expect(() => prepareCallSettings({ topK: 'invalid' as any })).toThrow(
          new InvalidArgumentError({
            parameter: 'topK',
            value: 'invalid',
            message: 'topK must be a number',
          }),
        );
      });
    });

    describe('presencePenalty', () => {
      it('should throw InvalidArgumentError if presencePenalty is not a number', () => {
        expect(() =>
          prepareCallSettings({ presencePenalty: 'invalid' as any }),
        ).toThrow(
          new InvalidArgumentError({
            parameter: 'presencePenalty',
            value: 'invalid',
            message: 'presencePenalty must be a number',
          }),
        );
      });
    });

    describe('frequencyPenalty', () => {
      it('should throw InvalidArgumentError if frequencyPenalty is not a number', () => {
        expect(() =>
          prepareCallSettings({ frequencyPenalty: 'invalid' as any }),
        ).toThrow(
          new InvalidArgumentError({
            parameter: 'frequencyPenalty',
            value: 'invalid',
            message: 'frequencyPenalty must be a number',
          }),
        );
      });
    });

    describe('seed', () => {
      it('should throw InvalidArgumentError if seed is not an integer', () => {
        expect(() => prepareCallSettings({ seed: 10.5 })).toThrow(
          new InvalidArgumentError({
            parameter: 'seed',
            value: 10.5,
            message: 'seed must be an integer',
          }),
        );
      });
    });
  });

  it('should return a new object with limited values', () => {
    const settings = prepareCallSettings({
      maxOutputTokens: 100,
      temperature: 0.7,
      random: 'invalid',
    } as any);

    expect(settings).toMatchInlineSnapshot(`
      {
        "frequencyPenalty": undefined,
        "maxOutputTokens": 100,
        "presencePenalty": undefined,
        "seed": undefined,
        "stopSequences": undefined,
        "temperature": 0.7,
        "topK": undefined,
        "topP": undefined,
      }
    `);
  });
});
