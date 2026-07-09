// Minimal local app to test Cartesia Sonic 3.5 TTS and Ink-Whisper batch STT
// via @ai-sdk/cartesia. Ink 2 uses the provider's separate realtime API.
// Type text, pick a model + voice, hit Generate — the browser plays the audio.
// Reads CARTESIA_API_KEY from the environment (never sent to the browser).
import { createServer } from 'node:http';
import { lookup } from 'node:dns/promises';
import { createCartesia } from '@ai-sdk/cartesia';
import { generateSpeech, transcribe } from 'ai';

const cartesia = createCartesia();

function formatApiError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error ? error.cause : undefined;
  const code =
    cause && typeof cause === 'object' && 'code' in cause
      ? String(cause.code)
      : '';

  if (code === 'ENOTFOUND' || /getaddrinfo ENOTFOUND/i.test(message)) {
    return (
      'Cannot reach api.cartesia.ai (DNS lookup failed). ' +
      'Start the demo from macOS Terminal.app — Cursor\'s integrated terminal can block outbound DNS. ' +
      'Run: cd ai/examples/cartesia-tts-demo && pnpm start'
    );
  }

  if (
    code === 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' ||
    /unable to get local issuer certificate/i.test(message)
  ) {
    return (
      'TLS certificate verification failed when calling api.cartesia.ai. ' +
      'Use `pnpm start` (sets NODE_EXTRA_CA_CERTS) or export NODE_EXTRA_CA_CERTS=/etc/ssl/cert.pem.'
    );
  }

  return message;
}

async function checkConnectivity() {
  try {
    await lookup('api.cartesia.ai');
    return true;
  } catch {
    console.log(
      '⚠️  Cannot resolve api.cartesia.ai from this process. ' +
        'If you started the server from Cursor\'s terminal, re-run it from macOS Terminal.app instead.',
    );
    return false;
  }
}

const PORT = Number(process.env.PORT) || 5052;

const DEFAULT_VOICE_ID =
  process.env.CARTESIA_VOICE_ID || 'a0e99841-438c-4a64-b679-ae501e7d6091';

const SPEECH_MODELS = [
  'sonic-3.5',
  'sonic-3',
  'sonic-2',
  'sonic-turbo',
  'sonic-latest',
];

const DEFAULT_MODEL = SPEECH_MODELS[0];

const OUTPUT_FORMATS = ['mp3', 'wav', 'pcm', 'mulaw', 'alaw'];

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400..600&family=Geist:wght@400..700&display=swap" rel="stylesheet" />
  <title>Cartesia Sonic + Ink Demo</title>
  <style>
    :root {
      --bg: #fafafa;
      --card: #ffffff;
      --border: #eaeaea;
      --border-strong: #d6d6d6;
      --fg: #171717;
      --muted: #6b7280;
      --primary: #171717;
      --primary-fg: #ffffff;
      --primary-hover: #383838;
      --accent: #0070f3;
      --ring: rgba(0, 112, 243, 0.35);
      --error: #e5484d;
      --success: #1a7f37;
      --chip: #f1f1f1;
      --shadow: 0 1px 2px rgba(0, 0, 0, 0.04), 0 10px 30px rgba(0, 0, 0, 0.07);
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0a0a0a;
        --card: #111113;
        --border: #242424;
        --border-strong: #303030;
        --fg: #ededed;
        --muted: #9b9b9b;
        --primary: #ededed;
        --primary-fg: #0a0a0a;
        --primary-hover: #cfcfcf;
        --chip: #1c1c1f;
        --shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 12px 32px rgba(0, 0, 0, 0.55);
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: 56px 20px;
      background: var(--bg);
      color: var(--fg);
      font-family: 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .card {
      width: 100%;
      max-width: 560px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      box-shadow: var(--shadow);
      padding: 28px 28px 30px;
    }
    .title {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0;
      font-size: 20px;
      font-weight: 650;
      letter-spacing: -0.015em;
    }
    .subtitle {
      margin: 8px 0 24px;
      color: var(--muted);
      font-size: 13.5px;
      line-height: 1.55;
    }
    code {
      font-family: 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.85em;
      background: var(--chip);
      padding: 2px 6px;
      border-radius: 6px;
    }
    label {
      display: block;
      margin: 0 0 6px;
      font-size: 13px;
      font-weight: 550;
    }
    .muted { color: var(--muted); font-weight: 400; }
    .field { margin-bottom: 16px; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    textarea,
    input[type='text'],
    select {
      width: 100%;
      font: inherit;
      font-size: 14px;
      color: var(--fg);
      background: var(--card);
      border: 1px solid var(--border-strong);
      border-radius: 10px;
      padding: 10px 12px;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    textarea { min-height: 96px; resize: vertical; line-height: 1.55; }
    select {
      appearance: none;
      cursor: pointer;
      padding-right: 34px;
      background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><path d='M6 9l6 6 6-6'/></svg>");
      background-repeat: no-repeat;
      background-position: right 12px center;
    }
    textarea:focus,
    input:focus,
    select:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--ring);
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      margin-top: 4px;
      padding: 11px 16px;
      font: inherit;
      font-size: 14px;
      font-weight: 550;
      color: var(--primary-fg);
      background: var(--primary);
      border: 0;
      border-radius: 10px;
      cursor: pointer;
      transition: background 0.15s ease, opacity 0.15s ease;
    }
    .btn:hover:not(:disabled) { background: var(--primary-hover); }
    .btn:disabled { opacity: 0.6; cursor: default; }
    .spinner {
      display: none;
      width: 15px;
      height: 15px;
      border: 2px solid currentColor;
      border-right-color: transparent;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }
    .btn.loading .spinner { display: inline-block; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .status { margin-top: 14px; min-height: 18px; font-size: 13px; color: var(--muted); }
    .status.error { color: var(--error); }
    .status.success { color: var(--success); }
    audio { width: 100%; margin-top: 18px; }
    audio:not([src]) { display: none; }
    .divider { border: 0; border-top: 1px solid var(--border); margin: 26px 0; }
    .transcript { white-space: pre-wrap; font-size: 13.5px; line-height: 1.55; margin: 12px 0 0; padding: 12px 14px; background: var(--chip); border-radius: 10px; }
    .transcript:empty { display: none; }
  </style>
</head>
<body>
  <main class="card">
    <h1 class="title">🎙️ Cartesia Sonic + Ink Demo</h1>
    <p class="subtitle">
      Text-to-speech via <code>@ai-sdk/cartesia</code>
      <code>.speech()</code> through <code>generateSpeech</code>. Pick a Sonic model and voice ID.
    </p>

    <div class="field">
      <label for="text">Text</label>
      <textarea id="text">Hello from the AI SDK and Cartesia text to speech!</textarea>
    </div>

    <div class="field row">
      <div>
        <label for="model">Model</label>
        <select id="model">${SPEECH_MODELS.map(
          m => `<option value="${m}"${m === DEFAULT_MODEL ? ' selected' : ''}>${m}</option>`,
        ).join('')}</select>
      </div>
      <div>
        <label for="voice">Voice ID</label>
        <input id="voice" type="text" value="${DEFAULT_VOICE_ID}" />
      </div>
    </div>

    <div class="field row">
      <div>
        <label for="outputFormat">Output format</label>
        <select id="outputFormat">${OUTPUT_FORMATS.map(
          f => `<option value="${f}"${f === 'mp3' ? ' selected' : ''}>${f}</option>`,
        ).join('')}</select>
      </div>
      <div>
        <label for="language">Language <span class="muted">(optional ISO 639-1)</span></label>
        <input id="language" type="text" placeholder="e.g. en" />
      </div>
    </div>

    <button id="go" class="btn">
      <span class="spinner"></span>
      <span id="go-label">Generate &amp; play</span>
    </button>
    <div id="status" class="status"></div>
    <audio id="audio" controls></audio>

    <hr class="divider" />
    <p class="subtitle" style="margin-bottom:14px">
      🎙️ Push to talk: hold the button, speak, release — transcribed with
      <code>@ai-sdk/cartesia</code> <code>.transcription()</code> (Ink-Whisper batch).
      Ink 2 is available separately through <code>.experimental_realtime('ink-2')</code>.
    </p>
    <div class="field">
      <label for="stt-language">Language <span class="muted">(optional — auto-detected if blank)</span></label>
      <input id="stt-language" type="text" placeholder="e.g. en" />
    </div>
    <button id="ptt" class="btn">
      <span class="spinner"></span>
      <span id="ptt-label">🎙️ Hold to talk</span>
    </button>
    <div id="transcribe-status" class="status"></div>
    <pre id="transcript" class="transcript"></pre>
  </main>

  <script>
    var $ = function (id) { return document.getElementById(id); };
    $('go').onclick = async function () {
      var btn = $('go');
      var status = $('status');
      var label = $('go-label');
      btn.disabled = true;
      btn.classList.add('loading');
      label.textContent = 'Generating…';
      status.className = 'status';
      status.textContent = '';
      try {
        var res = await fetch('/api/speech', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            text: $('text').value,
            model: $('model').value,
            voice: $('voice').value,
            outputFormat: $('outputFormat').value,
            language: $('language').value,
          }),
        });
        if (!res.ok) {
          var err = await res.json().catch(function () { return { error: res.statusText }; });
          throw new Error(err.error || 'request failed');
        }
        var blob = await res.blob();
        $('audio').src = URL.createObjectURL(blob);
        await $('audio').play().catch(function () {});
        status.className = 'status success';
        status.textContent = 'Done — ' + blob.type + ', ' + (blob.size / 1024).toFixed(1) + ' KB.';
      } catch (e) {
        status.className = 'status error';
        status.textContent = 'Error: ' + e.message;
      }
      btn.disabled = false;
      btn.classList.remove('loading');
      label.textContent = 'Generate & play';
    };

    // Push-to-talk: hold to record from the mic, release to transcribe.
    var pttRecorder = null;
    var pttChunks = [];
    var pttStream = null;
    var pttHolding = false;

    function setTxStatus(cls, text) {
      var s = $('transcribe-status');
      s.className = 'status' + (cls ? ' ' + cls : '');
      s.textContent = text;
    }

    async function transcribeBlob(blob) {
      var btn = $('ptt');
      btn.disabled = true;
      btn.classList.add('loading');
      $('ptt-label').textContent = 'Transcribing…';
      try {
        var qs = '';
        var lang = $('stt-language').value.trim();
        if (lang) qs = '?language=' + encodeURIComponent(lang);
        var res = await fetch('/api/transcribe' + qs, {
          method: 'POST',
          headers: { 'content-type': blob.type || 'audio/webm' },
          body: blob,
        });
        var data = await res.json().catch(function () { return { error: res.statusText }; });
        if (!res.ok) throw new Error(data.error || 'request failed');
        $('transcript').textContent = data.text || '(no speech detected)';
        setTxStatus(
          'success',
          'Done' +
            (data.language ? ' — language: ' + data.language : '') +
            (data.durationInSeconds != null
              ? ', ' + data.durationInSeconds.toFixed(2) + ' s'
              : '') +
            '.',
        );
      } catch (e) {
        setTxStatus('error', 'Error: ' + e.message);
      }
      btn.disabled = false;
      btn.classList.remove('loading');
      $('ptt-label').textContent = '🎙️ Hold to talk';
    }

    async function pttStart() {
      if (pttRecorder || $('ptt').disabled) return;
      pttHolding = true;
      setTxStatus('', '');
      $('transcript').textContent = '';
      $('ptt-label').textContent = '🔴 Recording… release to transcribe';
      try {
        pttStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        pttHolding = false;
        $('ptt-label').textContent = '🎙️ Hold to talk';
        setTxStatus('error', 'Microphone access denied.');
        return;
      }
      if (!pttHolding) {
        pttStream.getTracks().forEach(function (t) { t.stop(); });
        pttStream = null;
        $('ptt-label').textContent = '🎙️ Hold to talk';
        return;
      }
      pttChunks = [];
      pttRecorder = new MediaRecorder(pttStream);
      pttRecorder.ondataavailable = function (e) {
        if (e.data && e.data.size) pttChunks.push(e.data);
      };
      pttRecorder.onstop = function () {
        if (pttStream) pttStream.getTracks().forEach(function (t) { t.stop(); });
        var mime = (pttRecorder && pttRecorder.mimeType) || 'audio/webm';
        pttRecorder = null;
        pttStream = null;
        var blob = new Blob(pttChunks, { type: mime });
        if (!blob.size) {
          $('ptt-label').textContent = '🎙️ Hold to talk';
          setTxStatus('error', 'No audio captured — hold a little longer.');
          return;
        }
        transcribeBlob(blob);
      };
      pttRecorder.start();
    }

    function pttStop() {
      pttHolding = false;
      if (pttRecorder && pttRecorder.state === 'recording') {
        pttRecorder.stop();
      }
    }

    var ptt = $('ptt');
    ptt.addEventListener('mousedown', pttStart);
    ptt.addEventListener('mouseup', pttStop);
    ptt.addEventListener('mouseleave', pttStop);
    ptt.addEventListener('touchstart', function (e) { e.preventDefault(); pttStart(); });
    ptt.addEventListener('touchend', function (e) { e.preventDefault(); pttStop(); });
  </script>
</body>
</html>`;

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => (data += c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function readBuffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
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
      if (!process.env.CARTESIA_API_KEY) {
        throw new Error('CARTESIA_API_KEY is not set in the environment.');
      }

      const { text, voice, model, outputFormat, language } = await readJson(req);
      if (!text) throw new Error('text is required');

      const modelId = model || DEFAULT_MODEL;
      const voiceId = voice || DEFAULT_VOICE_ID;
      const codec = OUTPUT_FORMATS.includes(outputFormat) ? outputFormat : 'mp3';

      const result = await generateSpeech({
        model: cartesia.speech(modelId),
        text,
        voice: voiceId,
        outputFormat: codec,
        language: language || undefined,
      });

      if (result.warnings?.length) {
        console.log('warnings:', JSON.stringify(result.warnings));
      }
      console.log(
        'generated',
        result.audio.uint8Array.length,
        'bytes',
        result.audio.mediaType,
        '| model:',
        modelId,
      );

      res.writeHead(200, {
        'content-type': result.audio.mediaType || MEDIA_TYPES[codec] || 'audio/mpeg',
      });
      res.end(Buffer.from(result.audio.uint8Array));
    } catch (e) {
      const message = formatApiError(e);
      console.error('speech error:', message);
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: message }));
    }
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/api/transcribe')) {
    try {
      if (!process.env.CARTESIA_API_KEY) {
        throw new Error('CARTESIA_API_KEY is not set in the environment.');
      }

      const reqUrl = new URL(req.url, 'http://localhost');
      const language = reqUrl.searchParams.get('language') || undefined;
      const audio = await readBuffer(req);
      if (!audio.length) throw new Error('no audio provided');

      const contentType = req.headers['content-type'] || 'audio/webm';

      const result = await transcribe({
        model: cartesia.transcription('ink-whisper'),
        audio: new Uint8Array(audio),
        mediaType: contentType.split(';')[0],
        providerOptions: {
          cartesia: {
            language,
            timestampGranularities: ['word'],
          },
        },
      });

      console.log(
        'transcribed',
        audio.length,
        'bytes →',
        JSON.stringify(result.text).slice(0, 100),
      );
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          text: result.text,
          language: result.language,
          durationInSeconds: result.durationInSeconds,
        }),
      );
    } catch (e) {
      const message = formatApiError(e);
      console.error('transcribe error:', message);
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: message }));
    }
    return;
  }

  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
});

server.listen(PORT, () => {
  console.log(`🎙️  Cartesia voice demo → http://localhost:${PORT}`);
  if (!process.env.CARTESIA_API_KEY) {
    console.log('⚠️  CARTESIA_API_KEY is not set — copy .env.example to .env and add your key.');
  }
  void checkConnectivity();
});
