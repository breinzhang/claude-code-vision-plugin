import { describe, expect, it } from 'vitest';
import { assertUrlAllowed } from '../../src/security/url-policy.js';
import { downloadUrlImage } from '../../src/sources/url-source.js';
import { tinyPng } from '../fixtures/images.js';
import { startHttpServer } from '../helpers/http-server.js';

const defaultPolicy = {
  allowHttpUrls: false,
  allowPrivateNetworkUrls: false,
};

const testDownloadOptions = {
  allowHttpUrls: true,
  allowPrivateNetworkUrls: true,
  maxImageBytes: 1024 * 1024,
  timeoutMs: 1000,
  maxRedirects: 3,
};

describe('URL policy', () => {
  it('allows HTTPS public IP URLs by default', async () => {
    await expect(assertUrlAllowed(new URL('https://8.8.8.8/a.png'), defaultPolicy)).resolves.toBeUndefined();
  });

  it.each(['http://example.com/a.png', 'file:///tmp/a.png', 'data:image/png;base64,abc', 'ftp://example.com/a.png'])(
    'rejects %s by default',
    async (url) => {
      await expect(assertUrlAllowed(new URL(url), defaultPolicy)).rejects.toThrow(/https|denied/i);
    },
  );

  it.each([
    'https://localhost/a.png',
    'https://127.0.0.1/a.png',
    'https://10.0.0.1/a.png',
    'https://172.16.0.1/a.png',
    'https://172.31.255.255/a.png',
    'https://192.168.1.1/a.png',
    'https://169.254.1.1/a.png',
    'https://[::1]/a.png',
    'https://[fc00::1]/a.png',
    'https://[fd12:3456::1]/a.png',
    'https://[fe80::1]/a.png',
    'https://100.64.0.1/a.png',
    'https://100.127.255.255/a.png',
    'https://198.18.0.1/a.png',
    'https://224.0.0.1/a.png',
    'https://240.0.0.1/a.png',
    'https://255.255.255.255/a.png',
  ])('rejects localhost, private, loopback, and link-local address %s by default', async (url) => {
    await expect(assertUrlAllowed(new URL(url), defaultPolicy)).rejects.toThrow(/private network/i);
  });

  it.each([
    'https://printer.local/a.png',
    'https://service.internal/a.png',
    'https://nas.lan/a.png',
    'https://router.localdomain/a.png',
  ])('rejects internal hostname %s before DNS lookup', async (url) => {
    await expect(assertUrlAllowed(new URL(url), defaultPolicy)).rejects.toThrow(/private network/i);
  });
});

describe('URL source download', () => {
  it('downloads an image when HTTP and private network URLs are explicitly allowed', async () => {
    const server = await startHttpServer((_req, res) => {
      res.setHeader('content-type', 'image/png');
      res.end(tinyPng);
    });

    try {
      const image = await downloadUrlImage(`${server.url}/a.png`, testDownloadOptions);
      expect(image.type).toBe('url');
      expect(image.originalRef).toBe(`${server.url}/a.png`);
      expect(image.mime).toBe('image/png');
      expect(image.ext).toBe('.png');
      expect(image.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(image.bytes.equals(tinyPng)).toBe(true);
    } finally {
      await server.close();
    }
  });

  it('follows redirects manually and resolves relative locations', async () => {
    const requests: string[] = [];
    const server = await startHttpServer((req, res) => {
      requests.push(req.url ?? '');
      if (req.url === '/redirect') {
        res.statusCode = 302;
        res.setHeader('location', '/a.png');
        res.end();
        return;
      }
      res.setHeader('content-type', 'image/png');
      res.end(tinyPng);
    });

    try {
      const image = await downloadUrlImage(`${server.url}/redirect`, testDownloadOptions);
      expect(image.mime).toBe('image/png');
      expect(requests).toEqual(['/redirect', '/a.png']);
    } finally {
      await server.close();
    }
  });

  it('rechecks URL policy for each redirect hop', async () => {
    const server = await startHttpServer((_req, res) => {
      res.statusCode = 302;
      res.setHeader('location', 'file:///tmp/a.png');
      res.end();
    });

    try {
      await expect(downloadUrlImage(`${server.url}/redirect`, testDownloadOptions)).rejects.toThrow(/https|denied/i);
    } finally {
      await server.close();
    }
  });

  it('rejects redirect chains that exceed the configured limit', async () => {
    const server = await startHttpServer((_req, res) => {
      res.statusCode = 302;
      res.setHeader('location', '/again');
      res.end();
    });

    try {
      await expect(
        downloadUrlImage(`${server.url}/again`, {
          ...testDownloadOptions,
          maxRedirects: 1,
        }),
      ).rejects.toThrow(/too many/i);
    } finally {
      await server.close();
    }
  });

  it('rejects non-image MIME responses', async () => {
    const server = await startHttpServer((_req, res) => {
      res.setHeader('content-type', 'text/plain');
      res.end('not an image');
    });

    try {
      await expect(downloadUrlImage(`${server.url}/a.txt`, testDownloadOptions)).rejects.toThrow(/not an image/i);
    } finally {
      await server.close();
    }
  });

  it('rejects images larger than the configured maximum', async () => {
    const server = await startHttpServer((_req, res) => {
      res.setHeader('content-type', 'image/png');
      res.end(tinyPng);
    });

    try {
      await expect(
        downloadUrlImage(`${server.url}/a.png`, {
          ...testDownloadOptions,
          maxImageBytes: tinyPng.length - 1,
        }),
      ).rejects.toThrow(/exceeds max size/i);
    } finally {
      await server.close();
    }
  });

  it('aborts downloads that exceed the configured timeout', async () => {
    const server = await startHttpServer((_req, res) => {
      setTimeout(() => {
        res.setHeader('content-type', 'image/png');
        res.end(tinyPng);
      }, 100);
    });

    try {
      await expect(
        downloadUrlImage(`${server.url}/slow.png`, {
          ...testDownloadOptions,
          timeoutMs: 10,
        }),
      ).rejects.toThrow(/timed out/i);
    } finally {
      await server.close();
    }
  });
});
