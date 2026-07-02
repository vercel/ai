#!/usr/bin/env node
const [toolName, inputJson = '{}'] = process.argv.slice(2);
if (!toolName) {
  console.error('Usage: harness-tool <tool_name> <json_input>');
  process.exit(64);
}
let input;
try {
  input = JSON.parse(inputJson);
} catch (error) {
  console.error('Invalid JSON input: ' + (error instanceof Error ? error.message : String(error)));
  process.exit(64);
}
const requestId = 'cli-' + Date.now() + '-' + Math.random().toString(16).slice(2);
const response = await fetch('http://127.0.0.1:45397', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ requestId, toolName, input }),
});
const text = await response.text();
let payload;
try {
  payload = text ? JSON.parse(text) : {};
} catch {
  payload = { error: text };
}
if (!response.ok || payload.error) {
  console.error(String(payload.error ?? ('tool relay failed with HTTP ' + response.status)));
  process.exit(1);
}
console.log(JSON.stringify(payload.result ?? payload, null, 2));
