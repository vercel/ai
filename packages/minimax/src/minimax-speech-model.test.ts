import { createTestServer } from '@ai-sdk/provider-utils/test';
// import { MinimaxSpeechModel } from './minimax-speech-model';
import { createMinimax } from './minimax-provider';

const provider = createMinimax({
  apiKey: 'test-api-key',
  groupId: 'test-group-id',
});
const model = provider.speech('speech-02-hd');
const url = 'https://api.minimaxi.chat/v1/t2a_v2';

const server = createTestServer({
  [url]: {},
});

describe('doGenerate', () => {
  function prepareAudioResponse({
    headers,
  }: {
    headers?: Record<string, string>;
  } = {}) {
    server.urls[url].response = {
      type: 'json-value',
      headers: {
        'content-type': 'application/json',
        ...headers,
      },
      body: {
        data: {
          audio: 'hex audio',
          status: 2,
          subtitle_file:
            'https://minimax-algeng-chat-tts.oss-cn-wulanchabu.aliyuncs.com/XXXX',
        },
        extra_info: {
          audio_length: 5746,
          audio_sample_rate: 32000,
          audio_size: 100845,
          audio_bitrate: 128000,
          word_count: 300,
          invisible_character_ratio: 0,
          audio_format: 'mp3',
          usage_characters: 630,
        },
        trace_id: '01b8bf9bb7433cc75c18eee6cfa8fe21',
        base_resp: {
          status_code: 0,
          status_msg: '',
        },
      },
    };
  }

  it('should pass the model and text', async () => {
    prepareAudioResponse();

    await model.doGenerate({
      text: 'Hello from the AI SDK!',
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      model: 'speech-02-hd',
      text: 'Hello from the AI SDK!',
    });
  });

  it('should pass headers', async () => {
    prepareAudioResponse();

    const provider = createMinimax({
      apiKey: 'test-api-key',
      groupId: 'test-group-id',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.speech('speech-02-hd').doGenerate({
      text: 'Hello from the AI SDK!',
      headers: {
        'Custom-Request-Header': 'request-header-value',
      },
    });

    expect(server.calls[0].requestHeaders).toMatchObject({
      'content-type': 'application/json',
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
    });
  });

  it('should pass options', async () => {
    prepareAudioResponse();

    await model.doGenerate({
      text: 'Hello from the AI SDK!',
      voice: 'Wise_Woman',
      outputFormat: 'mp3',
      speed: 1.5,
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      model: 'speech-02-hd',
      text: 'Hello from the AI SDK!',
      voice_setting: {
        voice_id: 'Wise_Woman',
        speed: 1.5,
      },
      audio_setting: {
        format: 'mp3',
      },
    });
  });

  it('should pass more minimax options', async () => {
    prepareAudioResponse();

    await model.doGenerate({
      text: 'Hello from the AI SDK!',
      voice: 'Wise_Woman',
      outputFormat: 'mp3',
      speed: 1.5,
      providerOptions: {
        minimax: {
          audio_setting: {
            format: 'pcm',
            bitrate: 128000,
            sample_rate: 32000,
            channel: 2,
          },
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      model: 'speech-02-hd',
      text: 'Hello from the AI SDK!',
      voice_setting: {
        voice_id: 'Wise_Woman',
        speed: 1.5,
      },
      audio_setting: {
        format: 'pcm',
        bitrate: 128000,
        sample_rate: 32000,
        channel: 2,
      },
    });
  });

  it('should return audio data with correct content type', async () => {
    const audio = Buffer.from('hex audio', 'hex');
    prepareAudioResponse();

    const result = await model.doGenerate({
      text: 'Hello from the AI SDK!',
      outputFormat: 'mp3',
    });

    expect(result.audio).toStrictEqual(audio);
  });

  it('should include warnings if any are generated', async () => {
    prepareAudioResponse();

    const result = await model.doGenerate({
      text: 'Hello from the AI SDK!',
    });

    expect(result.warnings).toEqual([]);
  });
});
