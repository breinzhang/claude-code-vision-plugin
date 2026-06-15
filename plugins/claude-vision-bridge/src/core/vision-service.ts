import { homedir } from 'node:os';
import type {
  AnalyzeImageRequest,
  AnalyzeImageResult,
  FailureArtifact,
  FailureCategory,
  ImageSource,
  PluginConfig,
  ResolvedImageSource,
} from './types.js';
import { CacheManager } from '../cache/cache-manager.js';
import { stableJsonHash } from '../cache/hash.js';
import { buildFailureArtifact } from '../failure/failure-artifact.js';
import { buildProviders } from '../providers/registry.js';
import { runProviderLoop } from '../router/vision-router.js';
import { assertPathAllowed } from '../security/path-policy.js';
import { decodeBase64Image } from '../sources/base64-source.js';
import { resolveClipboardImage } from '../sources/clipboard-source.js';
import { resolvePathImage } from '../sources/path-source.js';
import { downloadUrlImage } from '../sources/url-source.js';

const CACHE_ANALYSIS_PIPELINE_VERSION = 'analysis-pipeline.v2';

export class VisionService {
  private readonly cache: CacheManager;

  constructor(private readonly config: PluginConfig) {
    this.cache = new CacheManager({ dataDir: config.pluginDataDir });
  }

  async analyzeOne(request: AnalyzeImageRequest, context: { cwd: string }): Promise<AnalyzeImageResult> {
    let image: ResolvedImageSource;
    try {
      image = await this.resolveSource(request, context);
    } catch (error) {
      return buildFailureArtifact({
        category: mapSourceFailureCategory(request.source, error),
        message: error instanceof Error ? error.message : String(error),
        source: sourceFailureDetails(request.source),
        attemptedProviders: [],
        remoteFallbackAllowed: this.config.allowRemoteFallback,
      });
    }

    const key = stableJsonHash({
      sha256: image.sha256,
      mode: request.mode,
      prompt: request.prompt,
      providerOrder: this.config.providerOrder,
      remoteFallbackAllowed: this.config.allowRemoteFallback,
      analysisPipelineVersion: CACHE_ANALYSIS_PIPELINE_VERSION,
      schemaVersion: 'vision-artifact.v1',
    });

    const cachedSuccess = this.cache.readSuccess(key);
    if (cachedSuccess) {
      return { ...cachedSuccess, timings: { ...cachedSuccess.timings, cacheHit: true } };
    }

    const cachedFailure = this.cache.readFailure(key, 120_000);
    if (cachedFailure) return cachedFailure;

    try {
      const result = await runProviderLoop({
        request,
        image,
        providers: buildProviders(this.config),
        remoteFallbackAllowed: this.config.allowRemoteFallback,
      });

      if (result.artifactType === 'success') {
        this.cache.writeSuccess(key, result);
      } else {
        this.cache.writeFailure(key, result);
      }
      return result;
    } catch (error) {
      const failure = buildFailureArtifact({
        category: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : String(error),
        source: {
          type: image.type,
          originalRef: image.originalRef,
          resolvedPath: image.resolvedPath,
          sha256: image.sha256,
        },
        attemptedProviders: [],
        remoteFallbackAllowed: this.config.allowRemoteFallback,
      });
      this.cache.writeFailure(key, failure);
      return failure;
    }
  }

  async analyzeMany(requests: AnalyzeImageRequest[], context: { cwd: string }): Promise<AnalyzeImageResult[]> {
    const results: AnalyzeImageResult[] = [];
    for (const request of requests) {
      results.push(await this.analyzeOne(request, context));
    }
    return results;
  }

  private async resolveSource(request: AnalyzeImageRequest, context: { cwd: string }): Promise<ResolvedImageSource> {
    switch (request.source.type) {
      case 'path': {
        const realPath = assertPathAllowed(request.source.path, {
          cwd: context.cwd,
          homeDir: homedir(),
          allowedDirectories: this.config.allowedDirectories,
          deniedDirectories: this.config.deniedDirectories,
        });
        return resolvePathImage(realPath, { maxImageBytes: this.config.maxImageBytes });
      }
      case 'url':
        return await downloadUrlImage(request.source.url, {
          allowHttpUrls: this.config.allowHttpUrls,
          allowPrivateNetworkUrls: this.config.allowPrivateNetworkUrls,
          maxImageBytes: this.config.maxImageBytes,
          timeoutMs: request.timeoutMs,
          maxRedirects: 3,
        });
      case 'clipboard':
        return await resolveClipboardImage({
          pluginDataDir: this.config.pluginDataDir,
          maxImageBytes: this.config.maxImageBytes,
        });
      case 'base64':
        return decodeBase64Image({
          mime: request.source.mime,
          data: request.source.data,
          maxImageBytes: this.config.maxImageBytes,
        });
    }
  }
}

function mapSourceFailureCategory(source: ImageSource, error: unknown): FailureCategory {
  const message = error instanceof Error ? error.message : String(error);
  switch (source.type) {
    case 'path':
      return /denied|outside allowed roots|system directory|sensitive path/i.test(message)
        ? 'PATH_POLICY_DENIED'
        : 'NO_VALID_IMAGE';
    case 'url':
      return /denied|allowed by default|private network|scheme/i.test(message) ? 'URL_POLICY_DENIED' : 'NO_VALID_IMAGE';
    case 'clipboard':
      return /not available/i.test(message) ? 'CLIPBOARD_UNAVAILABLE' : 'CLIPBOARD_EMPTY';
    case 'base64':
      return 'INVALID_BASE64';
  }
}

function sourceFailureDetails(source: ImageSource): FailureArtifact['source'] {
  switch (source.type) {
    case 'path':
      return { type: 'path', originalRef: source.path };
    case 'url':
      return { type: 'url', originalRef: source.url };
    case 'clipboard':
      return { type: 'clipboard', originalRef: 'clipboard' };
    case 'base64':
      return { type: 'base64', originalRef: `base64:${source.mime}` };
  }
}
