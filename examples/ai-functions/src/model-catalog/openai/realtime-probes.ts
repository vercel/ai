import type { OpenAIProvider } from '@ai-sdk/openai';
import { parseJSON } from '@ai-sdk/provider-utils';
import { WebSocket } from 'ws';
import type { Experimental_RealtimeModelV4ClientEvent as ClientEvent } from '@ai-sdk/provider';
import { APIProbeError, type Entry, type Probe } from './audit';
import { speechFixture } from './media-probes';
import { createPacedAudioStream } from '../../stream-translate/create-paced-audio-stream';

async function socketSession(
  sdk: OpenAIProvider,
  modelId: string,
  api: 'live' | 'realtime',
  clientSecret: boolean,
  conversation = false,
): Promise<boolean | string> {
  const model = sdk.experimental_realtime(modelId, { api });
  const connection: {
    url: string;
    protocols?: string[];
    headers?: Record<string, string>;
  } = clientSecret
    ? await (async () => {
        if (!model.doCreateClientSecret || !model.getWebSocketConfig)
          throw new Error(
            'SDK adapter does not expose client-secret WebSockets.',
          );
        const secret = await Promise.resolve(
          model.doCreateClientSecret({ expiresAfterSeconds: 60 }),
        ).catch((error: unknown) => {
          const response = String(error).match(
            /client secret request failed: (\d+) ([\s\S]*)/,
          );
          if (response)
            throw new APIProbeError(response[2], Number(response[1]));
          throw error;
        });
        return model.getWebSocketConfig(secret);
      })()
    : await model.getServerWebSocketConfig!();
  const socket = new WebSocket(connection.url, connection.protocols, {
    headers: connection.headers,
    handshakeTimeout: 10_000,
  });
  const send = async (event: ClientEvent) =>
    socket.send(JSON.stringify(await model.serializeClientEvent(event)));
  try {
    return await new Promise<boolean | string>((resolve, reject) => {
      let settled = false;
      let output = false;
      const timer = setTimeout(
        () => finish(new Error('Realtime capability probe timed out.')),
        60_000,
      );
      const finish = (error?: unknown, observed: boolean | string = true) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(observed);
      };
      socket.on('error', error => finish(error));
      socket.on('close', () => {
        if (!settled)
          finish(
            new Error('Socket closed before capability evidence arrived.'),
          );
      });
      socket.on('unexpected-response', (_request, response) => {
        let body = '';
        response.on('data', chunk => {
          body += chunk.toString();
        });
        response.on('end', () =>
          finish(new APIProbeError(body, response.statusCode ?? 500)),
        );
      });
      socket.on('open', () => {
        if (api === 'live')
          void send({
            type: 'session-start',
            config: { instructions: 'Reply briefly to the speaker.' },
          }).catch(finish);
      });
      socket.on('message', data => {
        void (async () => {
          const parsed = await parseJSON({ text: data.toString() });
          const decoded = model.parseServerEvent(parsed);
          for (const event of Array.isArray(decoded) ? decoded : [decoded]) {
            if (event.type === 'error')
              throw new APIProbeError(event.message, 400, event.code);
            if (event.type === 'session-created')
              await send({
                type: 'session-update',
                config: {
                  outputModalities: ['text'],
                  instructions: 'Reply with OK only.',
                },
              });
            if (
              event.type === 'session-started' ||
              event.type === 'session-updated'
            ) {
              if (!conversation) {
                finish();
                return;
              }
              if (api === 'live') {
                const audio = createPacedAudioStream({
                  bytes: await speechFixture(),
                  sampleRate: 24000,
                  chunkDurationMs: 100,
                });
                for await (const chunk of audio)
                  await send({
                    type: 'input-audio-append',
                    audio: Buffer.from(chunk).toString('base64'),
                  });
                await send({ type: 'session-close' });
              } else {
                await send({
                  type: 'conversation-item-create',
                  item: { type: 'text-message', role: 'user', text: 'Say OK.' },
                });
                await send({
                  type: 'response-create',
                  options: { modalities: ['text'] },
                });
              }
            }
            if (
              event.type === 'text-delta' ||
              event.type === 'audio-chunk' ||
              event.type === 'transcript-fragment'
            )
              output = true;
            if (
              event.type === 'response-done' ||
              event.type === 'session-closed'
            ) {
              if (!output)
                throw new Error(
                  'Session ended without conversation output; semantics could not be verified.',
                );
              finish(
                undefined,
                event.type === 'response-done' ? 'turn-based' : 'continuous',
              );
            }
          }
        })().catch(error => finish(error));
      });
    });
  } finally {
    if (socket.readyState === WebSocket.OPEN && api === 'live')
      await send({ type: 'session-close' }).catch(() => {});
    socket.close();
    const cleanup = setTimeout(() => socket.terminate(), 1_000);
    cleanup.unref();
  }
}

async function webRTCSession(sdk: OpenAIProvider, modelId: string) {
  const model = sdk.experimental_realtime(modelId, { api: 'live' });
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    // tsx's function-name helper is not present in the isolated browser realm.
    await page.evaluate('globalThis.__name = value => value');
    const sdp = await page.evaluate(async label => {
      const peer = new RTCPeerConnection();
      const channel = peer.createDataChannel(label);
      peer.addTransceiver('audio', { direction: 'sendrecv' });
      Object.assign(globalThis, { auditPeer: peer, auditChannel: channel });
      await peer.setLocalDescription(await peer.createOffer());
      const deadline = Date.now() + 3_000;
      while (Date.now() < deadline) {
        if (peer.iceGatheringState === 'complete') break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return peer.localDescription!.sdp;
    }, model.getWebRTCConfig().dataChannelLabel);
    const answer = await model.doCreateWebRTCSession({
      sdp,
      abortSignal: AbortSignal.timeout(30_000),
    });
    const result = await page.evaluate(
      async ({ answerSDP, closeEvent }) => {
        const { auditPeer: peer, auditChannel: channel } =
          globalThis as unknown as {
            auditPeer: RTCPeerConnection;
            auditChannel: RTCDataChannel;
          };
        await peer.setRemoteDescription({ type: 'answer', sdp: answerSDP });
        try {
          await new Promise<void>((resolve, reject) => {
            let settled = false;
            const finish = (error?: Error) => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              if (error) reject(error);
              else resolve();
            };
            const timer = setTimeout(
              () => finish(new Error('WebRTC data channel timed out.')),
              20_000,
            );
            channel.onopen = () => finish();
            channel.onerror = () =>
              finish(new Error('WebRTC data channel failed.'));
            if (channel.readyState === 'open') finish();
          });
          return true;
        } finally {
          if (channel.readyState === 'open') {
            channel.send(closeEvent);
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          peer.close();
        }
      },
      {
        answerSDP: answer.sdp,
        closeEvent: JSON.stringify(
          model.serializeClientEvent({ type: 'session-close' }),
        ),
      },
    );
    return result;
  } finally {
    await browser.close();
  }
}

export function realtimeProbes(modelId: string, entry: Entry): Probe[] {
  const c = entry.capabilities.realtime;
  if (!c) return [];
  const api = entry.requestConfig?.realtime?.api ?? 'realtime';
  const probes: Probe[] = [
    {
      name: 'realtime/conversation',
      covers: ['realtime.conversation'],
      expected: c.conversation,
      compare: 'value',
      parameter: /model|session|live|realtime/,
      execute: sdk => socketSession(sdk, modelId, api, false, true),
    },
  ];
  for (const connection of [
    'server-websocket',
    'client-secret-websocket',
    'webrtc',
  ] as const)
    probes.push({
      name: `realtime/connections/${connection}`,
      covers: ['realtime.connections'],
      expected: c.connections.includes(connection),
      parameter: /model|session|transport|webrtc|websocket/,
      execute: sdk =>
        connection === 'webrtc'
          ? webRTCSession(sdk, modelId)
          : socketSession(
              sdk,
              modelId,
              connection === 'client-secret-websocket' ? 'realtime' : api,
              connection === 'client-secret-websocket',
            ),
    });
  for (const transport of ['websocket', 'webrtc'] as const)
    probes.push({
      name: `realtime/transports/${transport}`,
      covers: ['realtime.transports'],
      expected: c.transports.includes(transport),
      parameter: /model|session|transport|webrtc|websocket/,
      execute: sdk =>
        transport === 'webrtc'
          ? webRTCSession(sdk, modelId)
          : socketSession(sdk, modelId, api, false),
    });
  return probes;
}
