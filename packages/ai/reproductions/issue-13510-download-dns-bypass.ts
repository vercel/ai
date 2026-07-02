import { createServer, type Server } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { once } from 'node:events';
import { download } from '../src/util/download/download';

const hostsPath = '/etc/hosts';
const attackerControlledHostname = 'issue-13510-attacker-controlled.test';
const marker = 'issue-13510-private-service-response';

async function startPrivateLoopbackServer(): Promise<{
  server: Server;
  port: number;
}> {
  const server = createServer((request, response) => {
    if (request.url === '/latest/meta-data/iam/security-credentials/') {
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end(marker);
      return;
    }

    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('not found');
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error(`Unexpected server address: ${String(address)}`);
  }

  return { server, port: address.port };
}

async function closeServer(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()));
  });
}

const originalHosts = readFileSync(hostsPath, 'utf8');
let server: Server | undefined;
let downloadedPrivateResponse = false;
let restoredHosts = false;

try {
  ({ server } = await startPrivateLoopbackServer());
  const port = (server.address() as { port: number }).port;

  // Simulate attacker-controlled DNS by making a non-blocklisted hostname
  // resolve to an internal loopback address. The URL validator only sees the
  // hostname string, while fetch resolves the hostname later and reaches the
  // private service.
  const hostsEntry = `\n# AI SDK issue #13510 reproduction\n127.0.0.1 ${attackerControlledHostname}\n`;
  writeFileSync(hostsPath, `${originalHosts.replace(/\n*$/, '')}${hostsEntry}`);

  const url = new URL(
    `http://${attackerControlledHostname}:${port}/latest/meta-data/iam/security-credentials/`,
  );

  console.log(`Downloading ${url.toString()}`);
  console.log(
    `${attackerControlledHostname} is mapped to 127.0.0.1 in ${hostsPath} for this reproduction.`,
  );

  const result = await download({ url });
  const text = new TextDecoder().decode(result.data);

  console.log(`download() returned mediaType=${result.mediaType}`);
  console.log(`download() response body=${JSON.stringify(text)}`);

  downloadedPrivateResponse = text === marker;
} finally {
  writeFileSync(hostsPath, originalHosts);
  restoredHosts = true;

  if (server !== undefined) {
    await closeServer(server);
  }
}

if (!restoredHosts) {
  throw new Error(`Failed to restore ${hostsPath}`);
}

if (downloadedPrivateResponse) {
  throw new Error(
    `Reproduced issue #13510: download() accepted an attacker-controlled hostname and fetched ${marker} from a loopback/private service after DNS/hosts resolution. validateDownloadUrl blocked literal private IPs but did not validate the resolved address.`,
  );
}

console.log(
  'Issue #13510 was not reproduced: download() did not reach the private service.',
);
