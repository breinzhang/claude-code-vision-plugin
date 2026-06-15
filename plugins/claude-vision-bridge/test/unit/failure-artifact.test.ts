import { describe, expect, it } from 'vitest';
import { buildFailureArtifact } from '../../src/failure/failure-artifact.js';

describe('FailureArtifact', () => {
  it('renders visible failure guidance for Hook and MCP', () => {
    const artifact = buildFailureArtifact({
      category: 'REMOTE_DISABLED',
      message: 'Remote fallback is disabled.',
      source: { type: 'url', originalRef: 'https://example.com/a.png' },
      attemptedProviders: [{ id: 'ollama', status: 'failed', reason: 'ECONNREFUSED' }],
      remoteFallbackAllowed: false,
    });

    expect(artifact.artifactType).toBe('failure');
    expect(artifact.markdown).toContain('Vision Analysis Failed');
    expect(artifact.markdown).toContain('Do not assume image content');
    expect(artifact.markdown).toContain('REMOTE_DISABLED');
  });
});
