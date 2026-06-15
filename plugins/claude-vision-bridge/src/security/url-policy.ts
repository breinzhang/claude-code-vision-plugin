import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export interface UrlPolicyOptions {
  allowHttpUrls: boolean;
  allowPrivateNetworkUrls: boolean;
}

export async function assertUrlAllowed(url: URL, options: UrlPolicyOptions): Promise<void> {
  if (['file:', 'data:', 'ftp:'].includes(url.protocol)) {
    throw new Error(`URL scheme is denied: ${url.protocol}`);
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && options.allowHttpUrls)) {
    throw new Error('Only https image URLs are allowed by default');
  }

  if (!options.allowPrivateNetworkUrls) {
    await assertHostPublic(url.hostname);
  }
}

async function assertHostPublic(hostname: string): Promise<void> {
  const host = normalizeHostname(hostname);
  if (isPrivateHostname(host)) {
    throw new Error(`URL resolves to private network address: ${host}`);
  }

  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true });
  for (const item of addresses) {
    if (isPrivateAddress(item.address)) {
      throw new Error(`URL resolves to private network address: ${item.address}`);
    }
  }
}

function normalizeHostname(hostname: string): string {
  let host = hostname.trim().toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) {
    host = host.slice(1, -1);
  }
  if (host.endsWith('.')) {
    host = host.slice(0, -1);
  }
  return host;
}

function isPrivateHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.localdomain') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.lan')
  );
}

export function isPrivateAddress(address: string): boolean {
  const host = normalizeHostname(address);
  if (isPrivateHostname(host)) return true;

  const mappedIpv4 = host.match(/^(?:::ffff:|0:0:0:0:0:ffff:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mappedIpv4) {
    return isPrivateIpv4(mappedIpv4[1]);
  }

  if (isIP(host) === 4) {
    return isPrivateIpv4(host);
  }
  if (isIP(host) === 6) {
    return isPrivateIpv6(host);
  }
  return false;
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b] = parts;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIpv6(address: string): boolean {
  if (address === '::' || address === '::1') return true;

  const firstHextet = Number.parseInt(address.split(':')[0] || '0', 16);
  if (!Number.isFinite(firstHextet)) return false;
  if ((firstHextet & 0xfe00) === 0xfc00) return true;
  if ((firstHextet & 0xffc0) === 0xfe80) return true;
  if ((firstHextet & 0xff00) === 0xff00) return true;
  return false;
}
