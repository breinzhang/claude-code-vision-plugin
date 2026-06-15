import type { AnalyzeImageRequest, FailureArtifact, ResolvedImageSource, VisionArtifact } from '../core/types.js';
import { buildFailureArtifact } from '../failure/failure-artifact.js';
import { parseProviderOutput } from '../normalize/parse-provider-output.js';
import { renderVisionMarkdown } from '../normalize/render-markdown.js';
import { ProviderError, type VisionProvider } from '../providers/base.js';

export async function runProviderLoop(input: {
  request: AnalyzeImageRequest;
  image: ResolvedImageSource;
  providers: VisionProvider[];
  remoteFallbackAllowed: boolean;
}): Promise<VisionArtifact | FailureArtifact> {
  const startedAt = new Date();
  const attemptedProviders: FailureArtifact['failure']['attemptedProviders'] = [];
  const providers = orderProviders(input.providers, input.request.preferredProvider);

  for (const provider of providers) {
    try {
      const result = await provider.analyze({
        image: { mime: input.image.mime, bytes: input.image.bytes },
        prompt: input.request.prompt,
      });
      const analysis = parseProviderOutput({ mode: input.request.mode, text: result.text });
      const markdown = renderVisionMarkdown({
        sourceLabel: input.image.originalRef,
        providerLabel: `${result.providerId}/${result.model}`,
        output: analysis,
        maxOutputChars: input.request.maxOutputChars,
      });
      const completedAt = new Date();

      return {
        artifactType: 'success',
        schemaVersion: 'vision-artifact.v1',
        source: {
          type: input.image.type,
          originalRef: input.image.originalRef,
          resolvedPath: input.image.resolvedPath,
          sha256: input.image.sha256,
          mime: input.image.mime,
          bytes: input.image.bytes.length,
        },
        provider: {
          id: result.providerId,
          model: result.model,
          endpoint: result.endpoint,
          fallbackDepth: attemptedProviders.length,
        },
        timings: {
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          latencyMs: completedAt.getTime() - startedAt.getTime(),
          cacheHit: false,
        },
        analysis,
        markdown,
      };
    } catch (error) {
      attemptedProviders.push({
        id: provider.id,
        status: isTimeoutError(error) ? 'timeout' : 'failed',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return buildFailureArtifact({
    category: input.remoteFallbackAllowed ? 'LOCAL_PROVIDERS_FAILED' : 'REMOTE_DISABLED',
    message: input.remoteFallbackAllowed
      ? 'All configured providers failed.'
      : 'Local providers failed and remote fallback is disabled.',
    source: {
      type: input.image.type,
      originalRef: input.image.originalRef,
      resolvedPath: input.image.resolvedPath,
      sha256: input.image.sha256,
    },
    attemptedProviders,
    remoteFallbackAllowed: input.remoteFallbackAllowed,
  });
}

function orderProviders(providers: VisionProvider[], preferredProvider: AnalyzeImageRequest['preferredProvider']): VisionProvider[] {
  if (!preferredProvider) return providers;
  const preferred = providers.find((provider) => provider.id === preferredProvider);
  if (!preferred) return providers;
  return [preferred, ...providers.filter((provider) => provider.id !== preferredProvider)];
}

function isTimeoutError(error: unknown): boolean {
  if (error instanceof ProviderError) return error.category === 'TIMEOUT';
  return error instanceof Error && error.message.includes('TIMEOUT');
}
