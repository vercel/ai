// Self-contained HTML+JS page for the streaming transcription demo, served as a
// string by server.mjs. It captures mic audio, downsamples to 16-bit PCM at the
// provider's expected rate, streams raw chunks over a WebSocket, and renders the
// transcript parts (delta / partial / final) as they arrive.
export const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Streaming Transcription Demo</title>
  <style>
    :root {
      --bg: #fafafa; --card: #fff; --border: #e5e7eb; --fg: #18181b;
      --muted: #71717a; --button: #18181b; --button-text: #fff;
      --error: #dc2626; --success: #15803d; --surface: #f4f4f5; --accent: #2563eb;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #09090b; --card: #111113; --border: #27272a; --fg: #f4f4f5;
        --muted: #a1a1aa; --button: #f4f4f5; --button-text: #09090b;
        --surface: #18181b; --accent: #60a5fa;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 52px 20px; background: var(--bg); color: var(--fg);
      font: 14px system-ui, sans-serif;
    }
    main {
      max-width: 640px; margin: 0 auto; padding: 28px;
      border: 1px solid var(--border); border-radius: 16px; background: var(--card);
    }
    h1 { margin: 0 0 8px; font-size: 22px; }
    p { margin: 0 0 24px; color: var(--muted); line-height: 1.5; }
    code { font-family: ui-monospace, monospace; }
    .field { margin-bottom: 16px; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    label { display: block; margin-bottom: 6px; font-weight: 600; }
    input, select {
      width: 100%; padding: 10px 12px; border: 1px solid var(--border);
      border-radius: 9px; background: var(--card); color: var(--fg); font: inherit;
    }
    button {
      width: 100%; padding: 11px 16px; border: 0; border-radius: 9px;
      color: var(--button-text); background: var(--button); font: inherit;
      font-weight: 600; cursor: pointer;
    }
    button:disabled { opacity: .55; cursor: not-allowed; }
    button.recording { background: var(--error); color: #fff; }
    .hint { font-size: 12px; color: var(--muted); font-weight: normal; }
    #status { min-height: 20px; margin: 15px 0 0; color: var(--muted); }
    #status.error { color: var(--error); }
    #status.success { color: var(--success); }
    .transcript {
      margin-top: 18px; padding: 16px; border-radius: 10px; background: var(--surface);
      white-space: pre-wrap; line-height: 1.6; min-height: 80px;
    }
    .transcript:empty::before { content: 'Transcript will appear here…'; color: var(--muted); }
    .partial { color: var(--muted); font-style: italic; }
    .final { color: var(--fg); }
    .ch { font-size: 11px; color: var(--accent); font-family: ui-monospace, monospace; }
  </style>
</head>
<body>
  <main>
    <h1>Streaming Transcription</h1>
    <p>Live speech-to-text via <code>experimental_streamTranscribe</code>. Audio streams from your mic to the server, which relays it to the provider's realtime endpoint and streams the transcript back.</p>

    <div class="field row">
      <div>
        <label for="provider">Provider</label>
        <select id="provider"></select>
      </div>
      <div>
        <label for="language">Language <span class="hint">(optional)</span></label>
        <input id="language" type="text" placeholder="en" />
      </div>
    </div>
    <div class="field">
      <label for="keyterm">Key terms <span class="hint">(xAI only, comma separated)</span></label>
      <input id="keyterm" type="text" placeholder="AI SDK, Grok" />
    </div>

    <button id="record">Start recording</button>
    <div id="status"></div>
    <div id="transcript" class="transcript"></div>
  </main>
  <script type="module" src="/client.mjs"></script>
</body>
</html>`;
