import { createGroq } from '@ai-sdk/groq';
import { experimental_transcribe as transcribe } from 'ai';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const endpoint = 'https://api.groq.com/openai/v1/audio/transcriptions';
const modelId = 'whisper-large-v3';

function exactArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength,
  ) as ArrayBuffer;
}

async function convertMp3ToWebm(mp3: Uint8Array): Promise<Uint8Array> {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium',
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });

  try {
    const page = await browser.newPage();
    const webmBase64 = await page.evaluate(async mp3Base64 => {
      const binary = atob(mp3Base64);
      const mp3Bytes = Uint8Array.from(binary, character =>
        character.charCodeAt(0),
      );
      const audioContext = new AudioContext();
      await audioContext.resume();
      const audioBuffer = await audioContext.decodeAudioData(mp3Bytes.buffer);
      const destination = audioContext.createMediaStreamDestination();
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(destination);

      const mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        throw new Error(`Chromium does not support ${mimeType}`);
      }

      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(destination.stream, {
        audioBitsPerSecond: 32_000,
        mimeType,
      });
      recorder.ondataavailable = event => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      const recording = new Promise<Blob>((resolve, reject) => {
        recorder.onerror = () =>
          reject(new Error('MediaRecorder failed to encode WebM audio'));
        recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
      });

      source.onended = () => recorder.stop();
      recorder.start(100);
      source.start();

      const webm = new Uint8Array(await (await recording).arrayBuffer());
      await audioContext.close();

      let result = '';
      for (let offset = 0; offset < webm.length; offset += 0x8000) {
        result += String.fromCharCode(
          ...webm.subarray(offset, offset + 0x8000),
        );
      }
      return btoa(result);
    }, Buffer.from(mp3).toString('base64'));

    return Buffer.from(webmBase64, 'base64');
  } finally {
    await browser.close();
  }
}

async function callGroqDirectly({
  apiKey,
  audio,
  filename,
}: {
  apiKey: string;
  audio: Uint8Array;
  filename: string;
}) {
  const formData = new FormData();
  formData.append('model', modelId);
  formData.append(
    'file',
    new File([exactArrayBuffer(audio)], filename, { type: 'audio/webm' }),
  );

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });
  const body = await response.text();

  if ([401, 402, 403, 429].includes(response.status)) {
    throw new Error(`Groq access blocker (${response.status}): ${body}`);
  }

  return { body, ok: response.ok, status: response.status };
}

async function main() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is required');
  }

  const mp3 = await readFile('../../packages/groq/src/transcript-test.mp3');
  const webm = await convertMp3ToWebm(mp3);

  const direct = await callGroqDirectly({
    apiKey,
    audio: webm,
    filename: 'audio.webm',
  });
  if (!direct.ok) {
    throw new Error(`Direct valid WebM request failed: ${direct.body}`);
  }
  const directText = (JSON.parse(direct.body) as { text?: string }).text;
  if (!directText?.trim()) {
    throw new Error('Direct valid WebM request returned no transcription');
  }

  const legacyRequest = await callGroqDirectly({
    apiKey,
    audio: webm,
    filename: 'audio',
  });

  let sdkFilename: string | undefined;
  let sdkMediaType: string | undefined;
  const groq = createGroq({
    apiKey,
    fetch: async (input, init) => {
      const file =
        init?.body instanceof FormData ? init.body.get('file') : undefined;
      if (file instanceof File) {
        sdkFilename = file.name;
        sdkMediaType = file.type;
      }
      return fetch(input, init);
    },
  });

  const sdkResult = await transcribe({
    model: groq.transcription(modelId),
    audio: exactArrayBuffer(webm),
    maxRetries: 0,
  });
  if (!sdkResult.text.trim()) {
    throw new Error('AI SDK valid WebM request returned no transcription');
  }

  console.log(
    JSON.stringify(
      {
        direct: {
          status: direct.status,
          text: directText,
        },
        legacyFilenameRequest: legacyRequest,
        sdk: {
          filename: sdkFilename,
          mediaType: sdkMediaType,
          text: sdkResult.text,
        },
        webm: {
          bytes: webm.byteLength,
          signature: Array.from(webm.subarray(0, 4)),
        },
      },
      null,
      2,
    ),
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
