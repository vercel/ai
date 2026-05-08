import { describe, expect, it } from 'vitest';
import { parseGoogleInteractionsOutputs } from './parse-google-interactions-outputs';
import type { GoogleInteractionsContentBlock } from './google-interactions-api';

describe('parseGoogleInteractionsOutputs', () => {
  const generateId = () => 'gen-id';

  describe('thought blocks', () => {
    it('emits a reasoning part with providerMetadata.google.signature when the thought block carries a signature', () => {
      const outputs = [
        {
          type: 'thought',
          signature: 'thought-sig-AAA',
          summary: [{ type: 'text', text: 'I am thinking.' }],
        },
      ] as Array<GoogleInteractionsContentBlock>;
      const { content } = parseGoogleInteractionsOutputs({
        outputs,
        generateId,
      });
      expect(content).toMatchInlineSnapshot(`
        [
          {
            "providerMetadata": {
              "google": {
                "signature": "thought-sig-AAA",
              },
            },
            "text": "I am thinking.",
            "type": "reasoning",
          },
        ]
      `);
    });

    it('stamps providerMetadata.google.interactionId on every output part when interactionId is provided', () => {
      const outputs = [
        {
          type: 'thought',
          signature: 'thought-sig',
          summary: [{ type: 'text', text: 'planning...' }],
        },
        { type: 'text', text: 'answer' },
        {
          type: 'function_call',
          id: 'call_x',
          name: 'getWeather',
          arguments: { loc: 'NYC' },
          signature: 'fn-sig',
        },
      ] as Array<GoogleInteractionsContentBlock>;
      const { content, hasFunctionCall } = parseGoogleInteractionsOutputs({
        outputs,
        generateId,
        interactionId: 'v1_test-interaction',
      });
      expect(hasFunctionCall).toBe(true);
      expect(content).toMatchInlineSnapshot(`
        [
          {
            "providerMetadata": {
              "google": {
                "interactionId": "v1_test-interaction",
                "signature": "thought-sig",
              },
            },
            "text": "planning...",
            "type": "reasoning",
          },
          {
            "providerMetadata": {
              "google": {
                "interactionId": "v1_test-interaction",
              },
            },
            "text": "answer",
            "type": "text",
          },
          {
            "input": "{"loc":"NYC"}",
            "providerMetadata": {
              "google": {
                "interactionId": "v1_test-interaction",
                "signature": "fn-sig",
              },
            },
            "toolCallId": "call_x",
            "toolName": "getWeather",
            "type": "tool-call",
          },
        ]
      `);
    });

    it('omits providerMetadata when no signature and no interactionId are present', () => {
      const outputs = [
        { type: 'text', text: 'hello' },
      ] as Array<GoogleInteractionsContentBlock>;
      const { content } = parseGoogleInteractionsOutputs({
        outputs,
        generateId,
      });
      expect(content).toEqual([{ type: 'text', text: 'hello' }]);
    });
  });

  describe('function_call blocks', () => {
    it('captures function_call.signature into providerMetadata.google.signature', () => {
      const outputs = [
        {
          type: 'function_call',
          id: 'call_abc',
          name: 'doThing',
          arguments: {},
          signature: 'fn-sig-BBB',
        },
      ] as Array<GoogleInteractionsContentBlock>;
      const { content } = parseGoogleInteractionsOutputs({
        outputs,
        generateId,
      });
      expect(content[0]).toMatchObject({
        type: 'tool-call',
        toolCallId: 'call_abc',
        toolName: 'doThing',
        providerMetadata: {
          google: { signature: 'fn-sig-BBB' },
        },
      });
    });
  });

  describe('image blocks', () => {
    it('emits a file content part with mediaType + base64 data when an image block carries inline data', () => {
      const outputs = [
        {
          type: 'image',
          mime_type: 'image/png',
          data: 'aGVsbG8td29ybGQ=',
        },
      ] as Array<GoogleInteractionsContentBlock>;
      const { content } = parseGoogleInteractionsOutputs({
        outputs,
        generateId,
        interactionId: 'v1_image-out',
      });
      expect(content).toMatchInlineSnapshot(`
        [
          {
            "data": {
              "data": "aGVsbG8td29ybGQ=",
              "type": "data",
            },
            "mediaType": "image/png",
            "providerMetadata": {
              "google": {
                "interactionId": "v1_image-out",
              },
            },
            "type": "file",
          },
        ]
      `);
    });

    it('emits a file content part with a URL data variant when an image block carries a uri', () => {
      const outputs = [
        {
          type: 'image',
          mime_type: 'image/jpeg',
          uri: 'https://example.test/img.jpg',
        },
      ] as Array<GoogleInteractionsContentBlock>;
      const { content } = parseGoogleInteractionsOutputs({
        outputs,
        generateId,
      });
      expect(content[0]).toMatchObject({
        type: 'file',
        mediaType: 'image/jpeg',
        data: { type: 'url' },
      });
      expect((content[0] as { data: { url: URL } }).data.url.toString()).toBe(
        'https://example.test/img.jpg',
      );
    });

    it('skips an image block with neither data nor uri', () => {
      const outputs = [
        { type: 'image', mime_type: 'image/png' },
      ] as Array<GoogleInteractionsContentBlock>;
      const { content } = parseGoogleInteractionsOutputs({
        outputs,
        generateId,
      });
      expect(content).toEqual([]);
    });
  });
});
