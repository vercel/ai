// Minimal local app to test Gemini TTS via @ai-sdk/google and @ai-sdk/google-vertex.
// Type text, pick a model + voice, hit Generate — the browser plays the audio.
// Gemini API models read GOOGLE_GENERATIVE_AI_API_KEY; Vertex models read
// GOOGLE_VERTEX_PROJECT + GOOGLE_VERTEX_LOCATION (+ Google Cloud credentials).
import { createServer } from 'node:http';
import { google } from '@ai-sdk/google';
import { createGoogleVertex } from '@ai-sdk/google-vertex';
import {
  experimental_generateSpeech as generateSpeech,
  experimental_transcribe as transcribe,
} from 'ai';

const PORT = Number(process.env.PORT) || 5050;

// Env-var private keys are often stored as a single line or with escaped "\n".
// Google's auth needs a valid PEM with real newlines — reconstruct one.
function normalizePrivateKey(key) {
  if (!key) return key;
  const unescaped = key.trim().replace(/\\n/g, '\n');
  if (unescaped.includes('\n')) return unescaped;
  const body = unescaped
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  const wrapped = body.match(/.{1,64}/g)?.join('\n') ?? body;
  return `-----BEGIN PRIVATE KEY-----\n${wrapped}\n-----END PRIVATE KEY-----\n`;
}

// Build the Vertex provider. With a service account in the env
// (GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY) authenticate via googleAuthOptions;
// otherwise the provider uses express mode (GOOGLE_VERTEX_API_KEY) or ADC.
const vertex = createGoogleVertex({
  project: process.env.GOOGLE_VERTEX_PROJECT,
  location: process.env.GOOGLE_VERTEX_LOCATION,
  ...(process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY
    ? {
        googleAuthOptions: {
          credentials: {
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            private_key: normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY),
          },
        },
      }
    : {}),
});

// Two providers, separate model lists. Each <option> value encodes the provider
// to route to: "google:<id>" (Gemini API) or "vertex:<id>" (Vertex AI).
const MODEL_GROUPS = [
  {
    provider: 'google',
    label: 'Gemini API (@ai-sdk/google)',
    models: [
      'gemini-2.5-flash-preview-tts',
      'gemini-2.5-pro-preview-tts',
      'gemini-3.1-flash-tts-preview',
    ],
  },
  {
    provider: 'vertex',
    label: 'Vertex AI (@ai-sdk/google-vertex)',
    models: [
      'gemini-2.5-flash-tts',
      'gemini-2.5-pro-tts',
      'gemini-2.5-flash-lite-preview-tts',
      'gemini-3.1-flash-tts-preview',
    ],
  },
];

const DEFAULT_MODEL = `${MODEL_GROUPS[0].provider}:${MODEL_GROUPS[0].models[0]}`;

// Gemini's 30 prebuilt voices.
const VOICES = [
  'Kore', 'Puck', 'Zephyr', 'Charon', 'Fenrir', 'Leda', 'Orus', 'Aoede',
  'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba',
  'Despina', 'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar',
  'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi',
  'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat',
];

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400..600&family=Geist:wght@400..700&display=swap" rel="stylesheet" />
  <title>Google Gemini Text-to-Speech</title>
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
    <h1 class="title">🎙️ Google Gemini Text-to-Speech</h1>
    <p class="subtitle">
      Text-to-speech via <code>@ai-sdk/google</code> and <code>@ai-sdk/google-vertex</code>
      <code>.speech()</code> through <code>generateSpeech</code>. Pick a model from either group.
    </p>

    <div class="field">
      <label for="text">Text</label>
      <textarea id="text">Hello from the AI SDK and Gemini text to speech!</textarea>
    </div>

    <div class="field row">
      <div>
        <label for="model">Model</label>
        <select id="model">${MODEL_GROUPS.map(
          g =>
            `<optgroup label="${g.label}">${g.models
              .map(
                m =>
                  // Suffix the provider so the collapsed <select> stays unambiguous
                  // for models offered by both providers (e.g. gemini-3.1-flash-tts-preview).
                  `<option value="${g.provider}:${m}">${m} · ${g.provider === 'vertex' ? 'Vertex AI' : 'Gemini API'}</option>`,
              )
              .join('')}</optgroup>`,
        ).join('')}</select>
      </div>
      <div>
        <label for="voice">Voice</label>
        <select id="voice">${VOICES.map(v => `<option>${v}</option>`).join('')}</select>
      </div>
    </div>

    <div class="field">
      <label for="instructions">Instructions <span class="muted">(optional style direction)</span></label>
      <input id="instructions" type="text" placeholder="e.g. Say cheerfully and slowly" />
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
      <code>@ai-sdk/google-vertex</code> <code>.transcription()</code> (Chirp).
    </p>
    <div class="field row">
      <div>
        <label for="chirp-model">Chirp model</label>
        <select id="chirp-model"><option>chirp_2</option><option>chirp_3</option></select>
      </div>
      <div>
        <label for="chirp-region">Speech region <span class="muted">(not us-east5)</span></label>
        <input id="chirp-region" type="text" value="us-central1" />
      </div>
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
            instructions: $('instructions').value,
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
        var qs =
          '?model=' + encodeURIComponent($('chirp-model').value) +
          '&region=' + encodeURIComponent($('chirp-region').value);
        var res = await fetch('/api/transcribe' + qs, {
          method: 'POST',
          headers: { 'content-type': blob.type || 'audio/webm' },
          body: blob,
        });
        var data = await res.json().catch(function () { return { error: res.statusText }; });
        if (!res.ok) throw new Error(data.error || 'request failed');
        $('transcript').textContent = data.text || '(no speech detected)';
        setTxStatus('success', 'Done' + (data.language ? ' — language: ' + data.language : '') + '.');
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
    req.on('data', (c) => (data += c));
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
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(page);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/speech') {
    // Hoisted so the catch block can reference them for clearer error messages.
    let providerKey = 'google';
    let modelId = '';
    try {
      const { text, voice, model, instructions } = await readJson(req);
      if (!text) throw new Error('text is required');

      // `model` arrives as "google:<id>" or "vertex:<id>" from the dropdown.
      const selection = model || DEFAULT_MODEL;
      const sep = selection.indexOf(':');
      providerKey = sep === -1 ? 'google' : selection.slice(0, sep);
      modelId = sep === -1 ? selection : selection.slice(sep + 1);

      let speechModel;
      if (providerKey === 'vertex') {
        // Express mode needs only GOOGLE_VERTEX_API_KEY (routes through the
        // express endpoint); ADC mode needs project + location + Google Cloud
        // credentials.
        const hasExpressKey = !!process.env.GOOGLE_VERTEX_API_KEY;
        const hasAdc =
          !!process.env.GOOGLE_VERTEX_PROJECT &&
          !!process.env.GOOGLE_VERTEX_LOCATION;
        if (!hasExpressKey && !hasAdc) {
          throw new Error(
            'Vertex needs either GOOGLE_VERTEX_API_KEY (express mode), or GOOGLE_VERTEX_PROJECT + GOOGLE_VERTEX_LOCATION with Google Cloud credentials (e.g. `gcloud auth application-default login`).',
          );
        }
        speechModel = vertex.speech(modelId);
      } else {
        if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
          throw new Error('GOOGLE_GENERATIVE_AI_API_KEY is not set in the environment.');
        }
        speechModel = google.speech(modelId);
      }

      const result = await generateSpeech({
        model: speechModel,
        text,
        voice: voice || 'Kore',
        instructions: instructions || undefined,
      });

      if (result.warnings?.length) {
        console.log('warnings:', JSON.stringify(result.warnings));
      }
      console.log(
        'generated',
        result.audio.uint8Array.length,
        'bytes',
        result.audio.mediaType,
        '| providerMetadata:',
        JSON.stringify(result.providerMetadata),
      );

      res.writeHead(200, { 'content-type': result.audio.mediaType || 'audio/wav' });
      res.end(Buffer.from(result.audio.uint8Array));
    } catch (e) {
      let message = e instanceof Error ? e.message : String(e);
      // Vertex returns a verbose "Publisher Model ... was not found" when a model
      // isn't offered in the configured region — translate it to plain English.
      if (
        providerKey === 'vertex' &&
        /was not found|does not have access|Publisher Model/i.test(message)
      ) {
        const region = process.env.GOOGLE_VERTEX_LOCATION || '(unset)';
        message =
          `"${modelId}" isn't available on Vertex AI in region "${region}". ` +
          'Pick a model offered there (e.g. gemini-2.5-flash-tts), or set ' +
          'GOOGLE_VERTEX_LOCATION to a region that has it (e.g. global or us-central1) and restart.';
      }
      console.error('speech error:', message);
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: message }));
    }
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/api/transcribe')) {
    try {
      if (
        !process.env.GOOGLE_VERTEX_PROJECT ||
        !(process.env.GOOGLE_CLIENT_EMAIL || process.env.GOOGLE_VERTEX_API_KEY)
      ) {
        throw new Error(
          'Chirp needs GOOGLE_VERTEX_PROJECT + Google Cloud credentials, and the Cloud Speech-to-Text API enabled on the project.',
        );
      }
      const reqUrl = new URL(req.url, 'http://localhost');
      const model = reqUrl.searchParams.get('model') || 'chirp_2';
      const region = reqUrl.searchParams.get('region') || 'us-central1';
      const audio = await readBuffer(req);
      if (!audio.length) throw new Error('no audio provided');

      const result = await transcribe({
        model: vertex.transcription(model),
        audio: new Uint8Array(audio),
        providerOptions: { googleVertex: { region } },
      });

      console.log(
        'transcribed',
        audio.length,
        'bytes with',
        model,
        '@',
        region,
        '→',
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
      const message = e instanceof Error ? e.message : String(e);
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
  console.log(`🎙️  Gemini TTS demo → http://localhost:${PORT}`);
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    console.log('⚠️  GOOGLE_GENERATIVE_AI_API_KEY is not set — needed for the Gemini API models.');
  }
  const hasVertexCreds =
    process.env.GOOGLE_VERTEX_API_KEY ||
    (process.env.GOOGLE_VERTEX_PROJECT && process.env.GOOGLE_VERTEX_LOCATION);
  if (!hasVertexCreds) {
    console.log('⚠️  No Vertex creds — set GOOGLE_VERTEX_API_KEY (express) or GOOGLE_VERTEX_PROJECT + GOOGLE_VERTEX_LOCATION (ADC) for the Vertex AI models.');
  }
});
