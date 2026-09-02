// Minimal local app to test the Exa web search tool through the AI Gateway.
// Type a prompt, the model calls gateway.tools.exaSearch(), and the browser
// shows the streamed answer plus the raw Exa results. The API key stays on
// this server and is never sent to the browser.
import { createServer } from 'node:http';
import { gateway, streamText } from 'ai';

const PORT = Number(process.env.PORT) || 5052;
const MODELS = [
  'openai/gpt-5-nano',
  'openai/gpt-5-mini',
  'anthropic/claude-sonnet-4.5',
  'google/gemini-2.5-flash',
];

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
  <title>Exa Search Tool Demo</title>
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
      --surface: #f4f4f5;
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
        --surface: #18181b;
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
    main { max-width: 640px; margin: 0 auto; }
    h1 { font-size: 22px; margin: 0 0 6px; }
    p { color: var(--muted); line-height: 1.5; }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      background: var(--surface);
      padding: 2px 6px;
      border-radius: 6px;
      font-size: .85em;
    }
    .field { margin: 16px 0; }
    label { display: block; margin-bottom: 6px; font-weight: 600; }
    textarea, select {
      width: 100%;
      padding: 11px 12px;
      border: 1px solid var(--border);
      border-radius: 9px;
      background: var(--card);
      color: var(--fg);
      font: inherit;
    }
    textarea { height: 92px; resize: vertical; line-height: 1.5; }
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
    .answer {
      margin-top: 18px;
      padding: 14px;
      border-radius: 10px;
      background: var(--surface);
      white-space: pre-wrap;
      line-height: 1.6;
      min-height: 24px;
    }
    .answer:empty { display: none; }
    .results { margin-top: 18px; display: grid; gap: 10px; }
    .result {
      padding: 12px 14px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--card);
    }
    .result a { color: inherit; font-weight: 600; text-decoration: none; }
    .result a:hover { text-decoration: underline; }
    .result .url { color: var(--muted); font-size: 12px; margin: 4px 0 8px; word-break: break-all; }
    .result .snippet { color: var(--fg); font-size: 13px; line-height: 1.5; }
    .divider { border: 0; border-top: 1px solid var(--border); margin: 26px 0; }
    .section-label { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin: 0 0 4px; }
  </style>
</head>
<body>
  <main>
    <h1>Exa Search Tool Demo</h1>
    <p>Web search via <code>gateway.tools.exaSearch()</code>. The model decides when to search, streams an answer, and the raw Exa results are listed below.</p>

    <div class="field">
      <label for="prompt">Prompt</label>
      <textarea id="prompt">What are the most notable AI research developments this month? Search the web first.</textarea>
    </div>
    <div class="field">
      <label for="model">Model</label>
      <select id="model">${options(MODELS, MODELS[0])}</select>
    </div>
    <button id="run">Search and answer</button>
    <div id="status"></div>

    <p class="section-label" style="margin-top:20px">Answer</p>
    <div id="answer" class="answer"></div>

    <hr class="divider" />
    <p class="section-label">Exa results</p>
    <div id="results" class="results"></div>
  </main>
  <script>
    var get = function (id) { return document.getElementById(id); };

    get('run').onclick = async function () {
      var button = get('run');
      var status = get('status');
      button.disabled = true;
      button.textContent = 'Searching...';
      status.className = '';
      status.textContent = '';
      get('answer').textContent = '';
      get('results').innerHTML = '';
      try {
        var response = await fetch('/api/search', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            prompt: get('prompt').value,
            model: get('model').value,
          }),
        });
        if (!response.ok || !response.body) {
          var error = await response.json().catch(function () { return {}; });
          throw new Error(error.error || response.statusText);
        }
        var reader = response.body.getReader();
        var decoder = new TextDecoder();
        var buffer = '';
        while (true) {
          var chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          var lines = buffer.split('\\n');
          buffer = lines.pop();
          for (var i = 0; i < lines.length; i++) {
            if (!lines[i]) continue;
            var event = JSON.parse(lines[i]);
            if (event.type === 'text') {
              get('answer').textContent += event.value;
            } else if (event.type === 'results') {
              renderResults(event.value);
            } else if (event.type === 'error') {
              throw new Error(event.value);
            }
          }
        }
        status.className = 'success';
        status.textContent = 'Done.';
      } catch (error) {
        status.className = 'error';
        status.textContent = 'Error: ' + error.message;
      } finally {
        button.disabled = false;
        button.textContent = 'Search and answer';
      }
    };

    function renderResults(results) {
      var container = get('results');
      container.innerHTML = '';
      if (!results || !results.length) {
        container.textContent = 'No results returned.';
        return;
      }
      results.forEach(function (r) {
        var div = document.createElement('div');
        div.className = 'result';
        var title = document.createElement('a');
        title.href = r.url;
        title.target = '_blank';
        title.rel = 'noopener noreferrer';
        title.textContent = r.title || r.url;
        var url = document.createElement('div');
        url.className = 'url';
        url.textContent = r.url;
        div.appendChild(title);
        div.appendChild(url);
        if (r.snippet) {
          var snippet = document.createElement('div');
          snippet.className = 'snippet';
          snippet.textContent = r.snippet;
          div.appendChild(snippet);
        }
        container.appendChild(div);
      });
    }
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

// Flatten an Exa tool result payload into the compact shape the browser renders.
function toResults(output) {
  if (!output || !Array.isArray(output.results)) return [];
  return output.results.map(r => ({
    title: r.title,
    url: r.url,
    snippet: r.summary || (r.highlights && r.highlights[0]) || r.text || '',
  }));
}

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(page);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/search') {
    // Newline-delimited JSON events: { type: 'text' | 'results' | 'error', value }
    res.writeHead(200, {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-cache',
    });
    const send = event => res.write(JSON.stringify(event) + '\n');
    try {
      if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
        throw new Error(
          'AI_GATEWAY_API_KEY is not set. Add it to .env (or run on Vercel where VERCEL_OIDC_TOKEN is provided).',
        );
      }

      const { prompt, model } = await readJson(req);
      if (!prompt) throw new Error('prompt is required');

      const result = streamText({
        model: model || MODELS[0],
        prompt,
        tools: {
          exa_search: gateway.tools.exaSearch(),
        },
      });

      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          send({ type: 'text', value: part.text });
        } else if (part.type === 'tool-result' && part.output) {
          send({ type: 'results', value: toResults(part.output) });
        } else if (part.type === 'error') {
          const message =
            part.error instanceof Error
              ? part.error.message
              : String(part.error);
          send({ type: 'error', value: message });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('search error:', message);
      send({ type: 'error', value: message });
    } finally {
      res.end();
    }
    return;
  }

  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
});

server.listen(PORT, () => {
  console.log(`🔎  Exa search demo → http://localhost:${PORT}`);
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    console.log(
      '⚠️  AI_GATEWAY_API_KEY is not set — add it to .env before searching.',
    );
  }
});
