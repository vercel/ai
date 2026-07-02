import { lookup } from 'node:dns/promises';
import { validateDownloadUrl } from '../src/validate-download-url';

const literalMetadataUrl = 'http://169.254.169.254/latest/meta-data/';
const dnsAliasMetadataUrl =
  'http://169.254.169.254.nip.io/latest/meta-data/';

async function isBlocked(url: string): Promise<boolean> {
  try {
    // `await` keeps this reproduction usable if validateDownloadUrl is later
    // changed from sync to async as part of an SSRF fix.
    await validateDownloadUrl(url);
    return false;
  } catch {
    return true;
  }
}

async function logDnsResolution(hostname: string) {
  try {
    const records = await lookup(hostname, { all: true });
    console.log(
      `${hostname} resolved to: ${records
        .map(record => `${record.address} (IPv${record.family})`)
        .join(', ')}`,
    );
  } catch (error) {
    console.log(
      `DNS lookup for ${hostname} was unavailable in this environment; validation result still demonstrates the pre-fetch bypass. ${error}`,
    );
  }
}

const literalBlocked = await isBlocked(literalMetadataUrl);
console.log(
  `literal metadata URL validation: ${literalBlocked ? 'blocked' : 'allowed'}`,
);

if (!literalBlocked) {
  throw new Error(
    `Control failed: literal private metadata IP was not blocked: ${literalMetadataUrl}`,
  );
}

await logDnsResolution(new URL(dnsAliasMetadataUrl).hostname);

const dnsAliasBlocked = await isBlocked(dnsAliasMetadataUrl);
console.log(
  `DNS alias metadata URL validation: ${
    dnsAliasBlocked ? 'blocked' : 'allowed'
  }`,
);

if (!dnsAliasBlocked) {
  throw new Error(
    `Reproduced issue #13510: validateDownloadUrl allowed ${dnsAliasMetadataUrl}, even though this hostname can resolve to the private AWS metadata IP. The validator only checks hostname string patterns/literal IPs and does not reject DNS aliases to internal addresses before fetch.`,
  );
}

console.log('Issue #13510 was not reproduced: DNS alias URL was blocked.');
