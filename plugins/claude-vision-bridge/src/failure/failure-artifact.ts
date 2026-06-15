import type { FailureArtifact, FailureCategory, ImageSource } from '../core/types.js';

export function buildFailureArtifact(input: {
  category: FailureCategory;
  message: string;
  source?: { type: ImageSource['type']; originalRef: string; resolvedPath?: string; sha256?: string };
  attemptedProviders: FailureArtifact['failure']['attemptedProviders'];
  remoteFallbackAllowed: boolean;
}): FailureArtifact {
  const recommendedNextSteps = nextStepsFor(input.category);
  const markdown = [
    '## Vision Analysis Failed',
    '',
    'Image analysis failed, but the Claude Code session should continue.',
    '',
    '### Source',
    `- type: ${input.source?.type ?? 'unknown'}`,
    `- ref: ${input.source?.originalRef ?? 'unknown'}`,
    '',
    '### Failure Summary',
    `- category: ${input.category}`,
    `- message: ${input.message}`,
    `- remote fallback allowed: ${input.remoteFallbackAllowed ? 'yes' : 'no'}`,
    `- attempted providers: ${input.attemptedProviders.map((item) => `${item.id}:${item.status}`).join(', ') || 'none'}`,
    '',
    '### What Claude Code should do',
    '- Do not assume image content.',
    '- Use the user text, file name, and repository context first.',
    '- If the task depends on image details, ask the user for a local image path, URL, or fresh clipboard image.',
    '',
    '### Recommended next steps for user',
    ...recommendedNextSteps.map((step) => `- ${step}`),
  ].join('\n');

  return {
    artifactType: 'failure',
    schemaVersion: 'vision-failure.v1',
    source: input.source,
    failure: {
      category: input.category,
      message: input.message,
      attemptedProviders: input.attemptedProviders,
      remoteFallbackAllowed: input.remoteFallbackAllowed,
    },
    recommendedNextSteps,
    markdown,
  };
}

function nextStepsFor(category: FailureCategory): string[] {
  switch (category) {
    case 'PATH_POLICY_DENIED':
      return ['Move the image into your home directory or configure an allowed directory.'];
    case 'URL_POLICY_DENIED':
      return ['Use an HTTPS public image URL or update URL policy settings intentionally.'];
    case 'CLIPBOARD_EMPTY':
      return ['Copy the screenshot again, then immediately submit the prompt.'];
    case 'REMOTE_DISABLED':
      return ['Start a local VLM provider or explicitly enable remote fallback.'];
    case 'LOCAL_PROVIDERS_FAILED':
      return ['Run doctor_providers to inspect local VLM endpoints.'];
    default:
      return ['Run doctor_providers and retry with a known local image path.'];
  }
}
