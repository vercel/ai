// Browser-side of the streaming transcription demo.
//
// Captures mic audio via getUserMedia + an AudioWorklet-free ScriptProcessor
// fallback, downsamples the float32 mic signal to signed 16-bit little-endian
// PCM at the provider's expected sample rate, and streams raw PCM frames over a
// WebSocket to the Node server. Transcript parts (delta / partial / final) are
// rendered as they arrive.

const providerSelect = document.getElementById('provider');
const languageInput = document.getElementById('language');
const keytermInput = document.getElementById('keyterm');
const recordButton = document.getElementById('record');
const statusEl = document.getElementById('status');
const transcriptEl = document.getElementById('transcript');

let providers = [];
let recording = false;
let socket = null;
let audioContext = null;
let mediaStream = null;
let processor = null;
let sourceNode = null;

function setStatus(message, kind = '') {
  statusEl.textContent = message;
  statusEl.className = kind;
}

async function loadProviders() {
  try {
    const res = await fetch('/providers');
    providers = await res.json();
  } catch {
    providers = [];
  }

  providerSelect.innerHTML = '';
  for (const provider of providers) {
    const option = document.createElement('option');
    option.value = provider.id;
    option.textContent = provider.available
      ? provider.label
      : `${provider.label} (API key not set)`;
    option.disabled = !provider.available;
    providerSelect.appendChild(option);
  }

  const firstAvailable = providers.find(p => p.available);
  if (firstAvailable) {
    providerSelect.value = firstAvailable.id;
  } else {
    setStatus('No provider API keys set on the server.', 'error');
    recordButton.disabled = true;
  }
}

function selectedProvider() {
  return (
    providers.find(p => p.id === providerSelect.value) ?? providers[0] ?? null
  );
}

// Downsample a float32 buffer from `inputRate` to `targetRate` and convert to
// signed 16-bit little-endian PCM.
function floatToPcm16(input, inputRate, targetRate) {
  const ratio = inputRate / targetRate;
  const outLength = Math.floor(input.length / ratio);
  const output = new Int16Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const sample = input[Math.floor(i * ratio)];
    const clamped = Math.max(-1, Math.min(1, sample));
    output[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return output;
}

async function startRecording() {
  const provider = selectedProvider();
  if (!provider) return;

  const targetRate = provider.inputRate;

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    setStatus(`Mic access denied: ${err.message}`, 'error');
    return;
  }

  transcriptEl.innerHTML = '';
  setStatus('Connecting…');

  const wsUrl =
    (location.protocol === 'https:' ? 'wss://' : 'ws://') +
    location.host +
    '/transcribe';
  socket = new WebSocket(wsUrl);
  socket.binaryType = 'arraybuffer';

  const keyterm = keytermInput.value
    .split(',')
    .map(term => term.trim())
    .filter(Boolean);

  socket.onopen = () => {
    socket.send(
      JSON.stringify({
        type: 'start',
        provider: provider.id,
        language: languageInput.value.trim() || undefined,
        keyterm: keyterm.length ? keyterm : undefined,
      }),
    );

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    sourceNode = audioContext.createMediaStreamSource(mediaStream);
    processor = audioContext.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = event => {
      if (!recording || socket.readyState !== WebSocket.OPEN) return;
      const input = event.inputBuffer.getChannelData(0);
      const pcm = floatToPcm16(input, audioContext.sampleRate, targetRate);
      socket.send(pcm.buffer);
    };

    sourceNode.connect(processor);
    processor.connect(audioContext.destination);

    recording = true;
    recordButton.textContent = 'Stop recording';
    recordButton.classList.add('recording');
  };

  socket.onmessage = event => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    handleMessage(message);
  };

  socket.onerror = () => setStatus('WebSocket error.', 'error');
  socket.onclose = () => {
    if (recording) teardownAudio();
  };
}

let deltaBuffer = '';

function handleMessage(message) {
  switch (message.type) {
    case 'status':
      setStatus(
        message.status === 'streaming'
          ? 'Listening… speak now.'
          : `${message.status}…`,
      );
      break;

    case 'delta':
      // Append-only tokens (OpenAI gpt-realtime-whisper).
      deltaBuffer += message.delta;
      renderInterim(deltaBuffer);
      break;

    case 'partial':
      // Revisable interim result (xAI interim_results).
      renderInterim(message.text, message.channelIndex);
      break;

    case 'final':
      commitFinal(message.text, message.channelIndex);
      deltaBuffer = '';
      break;

    case 'done':
      setStatus('Done.', 'success');
      if (message.warnings?.length) {
        console.warn('warnings:', message.warnings);
      }
      break;

    case 'error':
      setStatus(`Error: ${message.error}`, 'error');
      break;
  }
}

let interimEl = null;

function channelTag(channelIndex) {
  return channelIndex == null ? '' : `[ch${channelIndex}] `;
}

function renderInterim(text, channelIndex) {
  if (interimEl == null) {
    interimEl = document.createElement('span');
    interimEl.className = 'partial';
    transcriptEl.appendChild(interimEl);
  }
  interimEl.textContent = `${channelTag(channelIndex)}${text}`;
}

function commitFinal(text, channelIndex) {
  if (interimEl != null) {
    transcriptEl.removeChild(interimEl);
    interimEl = null;
  }
  const line = document.createElement('div');
  line.className = 'final';
  if (channelIndex != null) {
    const tag = document.createElement('span');
    tag.className = 'ch';
    tag.textContent = channelTag(channelIndex);
    line.appendChild(tag);
  }
  line.appendChild(document.createTextNode(text));
  transcriptEl.appendChild(line);
}

function teardownAudio() {
  recording = false;
  recordButton.textContent = 'Start recording';
  recordButton.classList.remove('recording');
  interimEl = null;

  try {
    processor?.disconnect();
    sourceNode?.disconnect();
  } catch {}
  processor = null;
  sourceNode = null;

  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
}

function stopRecording() {
  if (socket?.readyState === WebSocket.OPEN) {
    // Tell the server to close the audio stream so the provider can emit its
    // final transcript, then let the server close the socket.
    socket.send(JSON.stringify({ type: 'stop' }));
  }
  teardownAudio();
}

recordButton.onclick = () => {
  if (recording) {
    stopRecording();
  } else {
    startRecording();
  }
};

loadProviders();
