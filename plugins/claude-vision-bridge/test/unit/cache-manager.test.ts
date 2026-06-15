import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CacheManager } from '../../src/cache/cache-manager.js';
import { withFileLock } from '../../src/cache/lock.js';
import type { VisionArtifact } from '../../src/core/types.js';
import { buildFailureArtifact } from '../../src/failure/failure-artifact.js';
import { withTempDir } from '../helpers/temp.js';

describe('CacheManager', () => {
  it('writes and reads success cache as separate JSON and Markdown files', () =>
    withTempDir((dir) => {
      const cache = new CacheManager({ dataDir: dir });
      const artifact = successArtifact();

      cache.writeSuccess('abc', artifact);

      expect(cache.readSuccess('abc')?.analysis.intentSummary).toBe('A UI screenshot.');
      expect(readFileSync(join(dir, 'cache', 'success', 'abc.md'), 'utf8')).toBe(artifact.markdown);
      expect(readdirSync(join(dir, 'cache', 'success')).sort()).toEqual(['abc.json', 'abc.md']);
      expect(existsSync(join(dir, 'cache', 'failure', 'abc.json'))).toBe(false);
    }));

  it('writes and reads failure cache with TTL', () =>
    withTempDir((dir) => {
      const cache = new CacheManager({ dataDir: dir });
      const artifact = buildFailureArtifact({
        category: 'REMOTE_DISABLED',
        message: 'Remote disabled',
        attemptedProviders: [],
        remoteFallbackAllowed: false,
      });

      cache.writeFailure('abc', artifact);

      expect(cache.readFailure('abc', 60_000)?.failure.category).toBe('REMOTE_DISABLED');
      expect(readFileSync(join(dir, 'cache', 'failure', 'abc.md'), 'utf8')).toBe(artifact.markdown);
      expect(cache.readFailure('abc', 0)).toBeUndefined();
      expect(cache.readFailure('abc', -1)).toBeUndefined();
    }));

  it('expires failure cache entries older than TTL', () =>
    withTempDir((dir) => {
      const cache = new CacheManager({ dataDir: dir });
      const artifact = buildFailureArtifact({
        category: 'REMOTE_DISABLED',
        message: 'Remote disabled',
        attemptedProviders: [],
        remoteFallbackAllowed: false,
      });

      cache.writeFailure('old', artifact);
      const oldDate = new Date(Date.now() - 120_000);
      utimesSync(join(dir, 'cache', 'failure', 'old.json'), oldDate, oldDate);

      expect(cache.readFailure('old', 60_000)).toBeUndefined();
    }));

  it('ignores corrupted or schema-mismatched cache files', () =>
    withTempDir((dir) => {
      const cache = new CacheManager({ dataDir: dir });
      cache.ensureDirs();
      writeFileSync(join(dir, 'cache', 'failure', 'bad-json.json'), '{bad json');
      writeFileSync(join(dir, 'cache', 'success', 'bad-schema.json'), JSON.stringify({ artifactType: 'success' }));

      expect(cache.readFailure('bad-json', 60_000)).toBeUndefined();
      expect(cache.readSuccess('bad-schema')).toBeUndefined();
    }));

  it('keeps success and failure directories separate', () =>
    withTempDir((dir) => {
      const cache = new CacheManager({ dataDir: dir });
      cache.ensureDirs();

      expect(existsSync(join(dir, 'cache', 'success'))).toBe(true);
      expect(existsSync(join(dir, 'cache', 'failure'))).toBe(true);
      expect(existsSync(join(dir, 'cache', 'locks'))).toBe(true);
    }));

  it('clears only the selected cache directories', () =>
    withTempDir((dir) => {
      const cache = new CacheManager({ dataDir: dir });
      cache.writeSuccess('ok', successArtifact());
      cache.writeFailure(
        'fail',
        buildFailureArtifact({
          category: 'REMOTE_DISABLED',
          message: 'Remote disabled',
          attemptedProviders: [],
          remoteFallbackAllowed: false,
        }),
      );

      cache.clear('success');
      expect(cache.readSuccess('ok')).toBeUndefined();
      expect(cache.readFailure('fail', 60_000)?.failure.category).toBe('REMOTE_DISABLED');

      cache.clear('all');
      expect(cache.readFailure('fail', 60_000)).toBeUndefined();
    }));
});

describe('withFileLock', () => {
  it('creates the lock while running and removes it afterward', () =>
    withTempDir((dir) => {
      const lockPath = join(dir, 'cache', 'locks', 'abc.lock');

      const result = withFileLock(lockPath, () => {
        expect(existsSync(lockPath)).toBe(true);
        return 'locked';
      });

      expect(result).toBe('locked');
      expect(existsSync(lockPath)).toBe(false);
    }));
});

function successArtifact(): VisionArtifact {
  return {
    artifactType: 'success',
    schemaVersion: 'vision-artifact.v1',
    source: {
      type: 'path',
      originalRef: '/tmp/image.png',
      sha256: 'a'.repeat(64),
      mime: 'image/png',
      bytes: 42,
    },
    provider: {
      id: 'ollama',
      model: 'llava',
      fallbackDepth: 0,
    },
    timings: {
      startedAt: '2026-06-14T00:00:00.000Z',
      completedAt: '2026-06-14T00:00:01.000Z',
      latencyMs: 1000,
      cacheHit: false,
    },
    analysis: {
      schemaVersion: 'vision.v1',
      mode: 'ui',
      intentSummary: 'A UI screenshot.',
      observations: ['A dialog is visible.'],
      likelyTechnicalCauses: [],
      recommendedCodeSearches: [],
      redactions: [],
      modelLimitations: [],
    },
    markdown: '## Vision\n\nA UI screenshot.',
  };
}
