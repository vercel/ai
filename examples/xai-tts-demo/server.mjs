// Minimal local app to test xAI TTS through @ai-sdk/xai.
// The API key remains on this server and is never sent to the browser.
import { createServer } from 'node:http';
import { xai } from '@ai-sdk/xai';
import { experimental_generateSpeech as generateSpeech } from 'ai';

const PORT = Number(process.env.PORT) || 5051;
const VOICES = ['eve', 'ara', 'rex', 'sal', 'leo'];
const LANGUAGES = ['auto', 'en', 'es-ES', 'fr', 'de', 'ja', 'pt-BR'];
const CODECS = ['mp3', 'wav', 'pcm', 'mulaw', 'alaw'];
const SAMPLE_RATES = [8000, 16000, 22050, 24000, 44100, 48000];

const options = (values, selected) =>
  values
    .map(
      value =>
        `<option value="${value}"${value === selected ? ' selected' : ''}>${value}</option>`,
    )
    .join('');

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>xAI Text-to-Speech</title>
  <style>
    :root {
      --bg: #fafafa;
      --card: #fff;
      --border: #e5e7eb;
      --fg: #18181b;
      --muted: #71717a;
      --button: #18181b;
      --button-text: #fff;
      --error: #dc2626;
      --success: #15803d;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #09090b;
        --card: #111113;
        --border: #27272a;
        --fg: #f4f4f5;
        --muted: #a1a1aa;
        --button: #f4f4f5;
        --button-text: #09090b;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 52px 20px;
      background: var(--bg);
      color: var(--fg);
      font: 14px system-ui, sans-serif;
    }
    main {
      max-width: 600px;
      margin: 0 auto;
      padding: 28px;
      border: 1px solid var(--border);
      border-radius: 16px;
      background: var(--card);
    }
    h1 { margin: 0 0 8px; font-size: 22px; }
    p { margin: 0 0 24px; color: var(--muted); line-height: 1.5; }
    code { font-family: ui-monospace, monospace; }
    .field { margin-bottom: 16px; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    label { display: block; margin-bottom: 6px; font-weight: 600; }
    textarea, input, select {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: 9px;
      background: var(--card);
      color: var(--fg);
      font: inherit;
    }
    textarea { height: 108px; resize: vertical; line-height: 1.5; }
    button {
      width: 100%;
      padding: 11px 16px;
      border: 0;
      border-radius: 9px;
      color: var(--button-text);
      background: var(--button);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    button:disabled { opacity: .55; cursor: wait; }
    #status { min-height: 20px; margin: 15px 0 0; color: var(--muted); }
    #status.error { color: var(--error); }
    #status.success { color: var(--success); }
    audio { width: 100%; margin-top: 16px; }
    audio:not([src]) { display: none; }
    .hint { font-size: 12px; color: var(--muted); font-weight: normal; }
  </style>
</head>
<body>
  <main>
    <h1>xAI Text-to-Speech</h1>
    <p>Speech via <code>@ai-sdk/xai</code> <code>xai.speech()</code> and <code>generateSpeech</code>. Include tags such as <code>[pause]</code> or <code>&lt;whisper&gt;...&lt;/whisper&gt;</code> in the text.</p>
    <div class="field">
      <label for="text">Text</label>
      <textarea id="text">Hello from the AI SDK. [pause] &lt;whisper&gt;This is xAI text to speech.&lt;/whisper&gt;</textarea>
    </div>
    <div class="field row">
      <div>
        <label for="voice">Voice</label>
        <select id="voice">${options(VOICES, 'eve')}</select>
      </div>
      <div>
        <label for="language">Language</label>
        <select id="language">${options(LANGUAGES, 'auto')}</select>
      </div>
    </div>
    <div class="field row">
      <div>
        <label for="codec">Output format</label>
        <select id="codec">${options(CODECS, 'mp3')}</select>
      </div>
      <div>
        <label for="sampleRate">Sample rate</label>
        <select id="sampleRate">${options(SAMPLE_RATES, 24000)}</select>
      </div>
    </div>
    <div class="field row">
      <div>
        <label for="speed">Speed <span class="hint">(0.7 - 1.5)</span></label>
        <input id="speed" type="number" min="0.7" max="1.5" step="0.1" value="1" />
      </div>
      <div>
        <label for="latency">Latency optimization</label>
        <select id="latency">${options([0, 1, 2], 0)}</select>
      </div>
    </div>
    <div class="field">
      <label><input id="normalization" type="checkbox" style="width:auto;margin-right:8px" />Normalize text for speech</label>
    </div>
    <button id="generate">Generate and play</button>
    <div id="status"></div>
    <audio id="audio" controls></audio>
  </main>
  <script>
    var get = function (id) { return document.getElementById(id); };
    get('generate').onclick = async function () {
      var button = get('generate');
      var status = get('status');
      button.disabled = true;
      button.textContent = 'Generating...';
      status.className = '';
      status.textContent = '';
      try {
        var response = await fetch('/api/speech', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            text: get('text').value,
            voice: get('voice').value,
            language: get('language').value,
            outputFormat: get('codec').value,
            sampleRate: Number(get('sampleRate').value),
            speed: Number(get('speed').value),
            optimizeStreamingLatency: Number(get('latency').value),
            textNormalization: get('normalization').checked,
          }),
        });
        if (!response.ok) {
          var error = await response.json().catch(function () { return {}; });
          throw new Error(error.error || response.statusText);
        }
        var audio = await response.blob();
        get('audio').src = URL.createObjectURL(audio);
        await get('audio').play().catch(function () {});
        status.className = 'success';
        status.textContent = 'Generated ' + (audio.size / 1024).toFixed(1) + ' KB (' + audio.type + ').';
      } catch (error) {
        status.className = 'error';
        status.textContent = 'Error: ' + error.message;
      } finally {
        button.disabled = false;
        button.textContent = 'Generate and play';
      }
    };
  </script>
</body>
</html>`;

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

const MEDIA_TYPES = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  pcm: 'audio/pcm',
  mulaw: 'audio/basic',
  alaw: 'audio/alaw',
};

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(page);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/speech') {
    try {
      if (!process.env.XAI_API_KEY) {
        throw new Error('XAI_API_KEY is not set in the environment.');
      }

      const {
        text,
        voice,
        language,
        outputFormat,
        sampleRate,
        speed,
        optimizeStreamingLatency,
        textNormalization,
      } = await readJson(req);

      if (!text) {
        throw new Error('text is required');
      }

      const codec = CODECS.includes(outputFormat) ? outputFormat : 'mp3';
      const result = await generateSpeech({
        model: xai.speech(),
        text,
        voice: voice || 'eve',
        language: language || 'auto',
        outputFormat: codec,
        speed,
        providerOptions: {
          xai: {
            sampleRate,
            optimizeStreamingLatency,
            textNormalization,
          },
        },
      });

      if (result.warnings.length) {
        console.log('warnings:', JSON.stringify(result.warnings));
      }

      res.writeHead(200, { 'content-type': MEDIA_TYPES[codec] });
      res.end(Buffer.from(result.audio.uint8Array));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('speech error:', message);
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: message }));
    }
    return;
  }

  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
});

server.listen(PORT, () => {
  console.log(`xAI TTS demo: http://localhost:${PORT}`);
  if (!process.env.XAI_API_KEY) {
    console.log('XAI_API_KEY is not set; add it to .env before generating audio.');
  }
});
