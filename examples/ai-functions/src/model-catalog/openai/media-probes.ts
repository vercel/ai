import { createOpenAI } from '@ai-sdk/openai';
import {
  embed,
  generateSpeech,
  transcribe,
  experimental_streamTranscribe as streamTranscribe,
  experimental_streamTranslate as streamTranslate,
} from 'ai';
import {
  parseJSON,
  safeParseJSON,
  type WebSocketConstructor,
} from '@ai-sdk/provider-utils';
import sharp from 'sharp';
import { WebSocket } from 'ws';
import { z } from 'zod/v4';
import { createPacedAudioStream } from '../../stream-translate/create-paced-audio-stream';
import { APIProbeError, type Entry, type Probe } from './audit';

let pcm: Promise<Uint8Array> | undefined;
export function speechFixture() {
  // Generated once per audit, through the SDK. No microphone or external file.
  return (pcm ??= generateSpeech({
    model: createOpenAI().speech('tts-1'),
    text: 'Hello. The red fox is sitting beside the blue house.',
    outputFormat: 'pcm',
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(60_000),
  }).then(result => result.audio.uint8Array));
}
function audioStream(bytes: Uint8Array) {
  return createPacedAudioStream({
    bytes,
    sampleRate: 24000,
    chunkDurationMs: 100,
  });
}
function wav(bytes: Uint8Array) {
  const header = Buffer.alloc(44);
  header.write('RIFF');
  header.writeUInt32LE(bytes.length + 36, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24000, 24);
  header.writeUInt32LE(48000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(bytes.length, 40);
  return Buffer.concat([header, bytes]);
}

/** Route only the model ID; all capability settings are encoded by the SDK. */
function transcriptionSocket(modelId?: string, delay?: string) {
  let remoteError: APIProbeError | undefined;
  class AuditedSocket extends WebSocket {
    private pending: Promise<void>;
    constructor(
      url: string | URL,
      protocols?: string | string[],
      options?: { headers?: Record<string, string | undefined> },
    ) {
      super(url, protocols, options);
      this.pending = Promise.resolve();
      this.on('message', data => {
        void safeParseJSON({
          text: data.toString(),
          schema: z.object({
            type: z.string(),
            error: z
              .object({
                message: z.string(),
                param: z.string().nullish(),
                code: z.string().nullish(),
              })
              .nullish(),
          }),
        }).then(parsed => {
          if (
            parsed.success &&
            parsed.value.type === 'error' &&
            parsed.value.error
          )
            remoteError = new APIProbeError(
              parsed.value.error.message,
              400,
              parsed.value.error.param ?? parsed.value.error.code ?? undefined,
            );
        });
      });
    }
    override send(data: Parameters<WebSocket['send']>[0]) {
      this.pending = this.pending
        .then(async () => {
          if (this.readyState !== WebSocket.OPEN) return;
          if (typeof data !== 'string')
            throw new Error('Expected a JSON SDK WebSocket message.');
          const message = await parseJSON({
            text: data,
            schema: z.object({ type: z.string() }).passthrough(),
          });
          if (modelId != null && message.type === 'session.update') {
            const session = z
              .object({
                audio: z
                  .object({
                    input: z
                      .object({
                        transcription: z
                          .object({
                            model: z.string(),
                            delay: z.string().optional(),
                          })
                          .passthrough(),
                      })
                      .passthrough(),
                  })
                  .passthrough(),
              })
              .passthrough()
              .parse(message.session);
            if (
              delay != null &&
              session.audio.input.transcription.delay !== delay
            )
              throw new Error(
                'SDK omitted streaming delay; API support was not tested.',
              );
            session.audio.input.transcription.model = modelId;
            message.session = session;
          }
          super.send(JSON.stringify(message));
        })
        .catch(error => {
          this.emit('error', error);
          this.close();
        });
    }
  }
  return {
    Socket: AuditedSocket as unknown as WebSocketConstructor,
    get error() {
      return remoteError;
    },
  };
}

export function mediaProbes(modelId: string, entry: Entry): Probe[] {
  const c = entry.capabilities;
  const probes: Probe[] = [];
  if (c.embedding)
    for (const dimensions of [undefined, 256])
      probes.push({
        name: dimensions
          ? 'embedding/customDimensions'
          : 'embedding/defaultDimensions',
        covers: [
          dimensions
            ? 'embedding.customDimensions'
            : 'embedding.defaultDimensions',
        ],
        expected: dimensions
          ? c.embedding.customDimensions
          : c.embedding.defaultDimensions,
        sent: dimensions ? /"dimensions":256/ : /"input":/,
        parameter: /dimensions/,
        execute: async sdk => {
          const result = await embed({
            model: sdk.embedding(modelId),
            value: 'Hello',
            providerOptions: { openai: { dimensions } },
            maxRetries: 0,
            abortSignal: AbortSignal.timeout(60_000),
          });
          return dimensions
            ? result.embedding.length === dimensions
            : result.embedding.length;
        },
      });
  if (c.image) {
    const sizes = Array.isArray(c.image.sizes)
      ? c.image.sizes
      : ['1024x1024', '1024x1280'];
    const generate = async (
      sdk: Parameters<Probe['execute']>[0],
      n: number,
      size = sizes[0],
      edit = false,
      mask = false,
    ) => {
      const file = {
        type: 'file' as const,
        mediaType: 'image/png',
        data: await sharp({
          create: {
            width: 1024,
            height: 1024,
            channels: 4,
            background: { r: 255, g: 0, b: 0, alpha: mask ? 0 : 1 },
          },
        })
          .png()
          .toBuffer(),
      };
      // The provider call intentionally avoids core batching and advertised
      // file-input gates, which are the catalog declarations under audit.
      const result = await sdk.image(modelId).doGenerate({
        prompt: 'A small red circle on white.',
        n,
        size: size as `${number}x${number}`,
        files: edit
          ? [
              {
                ...file,
                data: await sharp(file.data)
                  .flatten({ background: '#ffffff' })
                  .ensureAlpha()
                  .png()
                  .toBuffer(),
              },
            ]
          : undefined,
        mask: mask ? file : undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
        abortSignal: AbortSignal.timeout(180_000),
      });
      return result.images.length === n;
    };
    for (const size of sizes)
      probes.push({
        name: `image/sizes/${size}`,
        covers: ['image.sizes'],
        expected: true,
        sent: new RegExp(`"size":"${size}"`),
        parameter: /size/,
        execute: sdk => generate(sdk, 1, size),
      });
    for (const mask of [false, true])
      probes.push({
        name: mask ? 'image/maskInput' : 'image/fileInput',
        covers: [mask ? 'image.maskInput' : 'image.fileInput'],
        expected: mask ? c.image.maskInput : c.image.fileInput,
        sent: mask ? /"mask"/ : /"image(?:\[\])?"/,
        parameter: /mask|image|model|edit/,
        execute: sdk => generate(sdk, 1, sizes[0], true, mask),
      });
    if (c.image.maxImagesPerCall != null)
      for (const n of [c.image.maxImagesPerCall, c.image.maxImagesPerCall + 1])
        probes.push({
          name: `image/maxImagesPerCall/n=${n}`,
          covers: ['image.maxImagesPerCall'],
          expected: n === c.image.maxImagesPerCall,
          sent: new RegExp(`"n":${n}(?:,|})`),
          parameter: /\bn\b|number.*images|image.*count/,
          execute: sdk => generate(sdk, n),
        });
  }
  if (c.speech)
    probes.push({
      name: 'speech/instructions',
      covers: ['speech.instructions'],
      expected: c.speech.instructions,
      sent: /"instructions":/,
      parameter: /instructions/,
      execute: async sdk =>
        (
          await generateSpeech({
            model: sdk.speech(modelId),
            text: 'Hello.',
            instructions: 'Speak cheerfully.',
            maxRetries: 0,
            abortSignal: AbortSignal.timeout(60_000),
          })
        ).audio.uint8Array.length > 0,
    });
  if (c.transcription) {
    for (const field of [
      'transcription',
      'duration',
      'segments',
      'language',
    ] as const)
      probes.push({
        name: `transcription/${field}`,
        covers: [`transcription.${field}`],
        expected: c.transcription[field],
        compare: field === 'transcription' ? undefined : 'value',
        parameter: /model|response_format|timestamp|language|transcription/,
        execute: async sdk => {
          const result = await transcribe({
            model: sdk.transcription(modelId),
            audio: wav(await speechFixture()),
            ...(field === 'transcription'
              ? {}
              : {
                  providerOptions: {
                    openai: {
                      responseFormat:
                        entry.requestConfig?.transcription?.responseFormat ??
                        'verbose_json',
                    },
                  },
                }),
            ...(field === 'segments'
              ? { timestampGranularities: ['segment' as const] }
              : {}),
            maxRetries: 0,
            abortSignal: AbortSignal.timeout(60_000),
          });
          return field === 'transcription'
            ? result.text.length > 0
            : field === 'duration'
              ? result.durationInSeconds != null
              : field === 'segments'
                ? result.segments.length > 0
                : result.language != null;
        },
      });
    for (const delay of [
      undefined,
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh',
    ])
      probes.push({
        name: delay
          ? `transcription/streamingDelay/${delay}`
          : 'transcription/streaming',
        covers: [
          delay ? 'transcription.streamingDelay' : 'transcription.streaming',
        ],
        expected: delay
          ? (c.transcription.streamingDelay ?? 'unknown')
          : c.transcription.streaming,
        parameter: delay
          ? /delay|model|transcription/
          : /model|transcription|streaming/,
        execute: async () => {
          const transport = transcriptionSocket(modelId, delay);
          const sdk = createOpenAI({
            webSocket: transport.Socket,
          });
          // An encoding policy that permits streaming/delay lets the remote API
          // decide even for rows that would otherwise reject the call locally.
          const result = streamTranscribe({
            model: sdk.transcription('gpt-live-transcribe'),
            audio: audioStream(await speechFixture()),
            inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
            providerOptions: { openai: { streaming: { delay } } },
            abortSignal: AbortSignal.timeout(60_000),
          });
          try {
            for await (const part of result.fullStream)
              if (part.type === 'error') throw part.error;
            return (await result.text).length > 0;
          } catch (error) {
            throw transport.error ?? error;
          }
        },
      });
  }
  if (c.speechTranslation)
    for (const field of [
      'translatedAudio',
      'translatedText',
      'sourceTranscript',
    ] as const)
      probes.push({
        name: `speechTranslation/${field}`,
        covers: [`speechTranslation.${field}`],
        expected: c.speechTranslation[field],
        compare: 'value',
        parameter: /audio|transcript|translation|model/,
        execute: async () => {
          const transport = transcriptionSocket();
          const sdk = createOpenAI({ webSocket: transport.Socket });
          const result = streamTranslate({
            model: sdk.translation(modelId),
            audio: audioStream(await speechFixture()),
            inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
            targetLanguage: 'es',
            abortSignal: AbortSignal.timeout(60_000),
          });
          let bytes = 0;
          try {
            for await (const part of result.fullStream) {
              if (part.type === 'error') throw part.error;
              if (part.type === 'audio')
                bytes +=
                  typeof part.audio === 'string'
                    ? Buffer.from(part.audio, 'base64').length
                    : part.audio.length;
            }
          } catch (error) {
            throw transport.error ?? error;
          }
          return field === 'translatedAudio'
            ? bytes > 0
            : field === 'translatedText'
              ? (await result.translationText).length > 0
              : (await result.sourceText).length > 0;
        },
      });
  return probes;
}
