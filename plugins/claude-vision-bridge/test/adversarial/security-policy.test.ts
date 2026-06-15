import { existsSync, mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertPathAllowed } from '../../src/security/path-policy.js';
import { extractSourcesFromPrompt } from '../../src/sources/extract-from-prompt.js';
import { tinyPng } from '../fixtures/images.js';
import { withTempDir } from '../helpers/temp.js';

describe('path policy', () => {
  it('allows images under cwd, home, and explicit allowed directories by default', () =>
    withTempDir((dir) => {
      const cwd = join(dir, 'project');
      const homeDir = join(dir, 'home');
      const external = join(dir, 'external-images');
      mkdirSync(cwd);
      mkdirSync(homeDir);
      mkdirSync(external);

      const cwdFile = join(cwd, 'screen.png');
      const homeFile = join(homeDir, 'desktop.png');
      const allowedFile = join(external, 'shared.png');
      writeFileSync(cwdFile, tinyPng);
      writeFileSync(homeFile, tinyPng);
      writeFileSync(allowedFile, tinyPng);

      const baseOptions = {
        cwd,
        homeDir,
        allowedDirectories: [],
        deniedDirectories: [],
      };

      expect(assertPathAllowed('./screen.png', baseOptions)).toBe(realpathSync(cwdFile));
      expect(assertPathAllowed(homeFile, baseOptions)).toBe(realpathSync(homeFile));
      expect(
        assertPathAllowed(allowedFile, {
          ...baseOptions,
          allowedDirectories: [external],
        }),
      ).toBe(realpathSync(allowedFile));
    }));

  it('rejects macOS and Linux system paths even when explicitly allowed', () => {
    const systemPath = existsSync('/etc/hosts') ? '/etc/hosts' : '/bin/sh';

    expect(() =>
      assertPathAllowed(systemPath, {
        cwd: homedir(),
        homeDir: homedir(),
        allowedDirectories: [systemPath],
        deniedDirectories: [],
      }),
    ).toThrow(/system|denied/i);
  });

  it('rejects macOS private and optional system roots when present', () => {
    const systemRoots = ['/private', '/opt'].filter((root) => existsSync(root));
    expect(systemRoots.length).toBeGreaterThan(0);

    for (const systemRoot of systemRoots) {
      expect(() =>
        assertPathAllowed(systemRoot, {
          cwd: homedir(),
          homeDir: homedir(),
          allowedDirectories: [systemRoot],
          deniedDirectories: [],
        }),
      ).toThrow(/system|denied/i);
    }
  });

  it.each([
    ['.ssh directory', ['.ssh'], 'id_rsa.png'],
    ['.git directory', ['.git'], 'object.png'],
    ['node_modules directory', ['node_modules', 'pkg'], 'screen.png'],
    ['dist directory', ['dist'], 'screen.png'],
    ['build directory', ['build'], 'screen.png'],
    ['.env file', [], '.env.production.png'],
    ['PEM file', [], 'certificate.pem'],
    ['key file', [], 'private.key'],
  ])('rejects sensitive path: %s', (_name, segments, fileName) =>
    withTempDir((dir) => {
      const parent = join(dir, ...segments);
      mkdirSync(parent, { recursive: true });
      const file = join(parent, fileName);
      writeFileSync(file, tinyPng);

      expect(() =>
        assertPathAllowed(file, {
          cwd: dir,
          homeDir: dir,
          allowedDirectories: [dir],
          deniedDirectories: [],
        }),
      ).toThrow(/sensitive|denied/i);
    }));

  it('rejects symlinks whose real target is in a sensitive directory', () =>
    withTempDir((dir) => {
      const visible = join(dir, 'visible');
      const sshDir = join(dir, '.ssh');
      mkdirSync(visible);
      mkdirSync(sshDir);
      const target = join(sshDir, 'innocent-name.png');
      const link = join(visible, 'screen.png');
      writeFileSync(target, tinyPng);
      symlinkSync(target, link);

      expect(() =>
        assertPathAllowed(link, {
          cwd: visible,
          homeDir: dir,
          allowedDirectories: [visible],
          deniedDirectories: [],
        }),
      ).toThrow(/sensitive|denied/i);
    }));

  it('rejects symlinks whose real target is under a denied directory', () =>
    withTempDir((dir) => {
      const visible = join(dir, 'visible');
      const denied = join(dir, 'denied');
      mkdirSync(visible);
      mkdirSync(denied);
      const target = join(denied, 'secret.png');
      const link = join(visible, 'screen.png');
      writeFileSync(target, tinyPng);
      symlinkSync(target, link);

      expect(() =>
        assertPathAllowed(link, {
          cwd: visible,
          homeDir: visible,
          allowedDirectories: [visible],
          deniedDirectories: [denied],
        }),
      ).toThrow(/denied|outside allowed roots/i);
    }));
});

describe('prompt image source extraction', () => {
  it('extracts local paths, HTTP URLs, HTTPS URLs, and image chips from hook prompts', () => {
    const sources = extractSourcesFromPrompt(
      '看 ./screens/error.png, https://example.com/a.png, http://localhost:3000/b.jpg and [Image #12]',
    );

    expect(sources).toEqual([
      { type: 'path', path: './screens/error.png', origin: 'hook' },
      { type: 'url', url: 'https://example.com/a.png', origin: 'hook' },
      { type: 'url', url: 'http://localhost:3000/b.jpg', origin: 'hook' },
      { type: 'clipboard', origin: 'hook' },
    ]);
  });

  it('deduplicates repeated prompt sources while preserving first occurrence order', () => {
    const sources = extractSourcesFromPrompt(
      '"./screens/error.png" [Image #1] https://example.com/a.png ./screens/error.png [Image #2] https://example.com/a.png',
    );

    expect(sources).toEqual([
      { type: 'path', path: './screens/error.png', origin: 'hook' },
      { type: 'clipboard', origin: 'hook' },
      { type: 'url', url: 'https://example.com/a.png', origin: 'hook' },
    ]);
  });
});
