import type { ImageSource } from '../core/types.js';
import { supportedImageExtensions } from './mime.js';

const urlPattern = 'https?:\\/\\/[^\\s"\'`<>)]+';
const imageChipPattern = '\\[Image\\s+#\\d+\\]';

export function extractSourcesFromPrompt(prompt: string): ImageSource[] {
  const sources: ImageSource[] = [];
  const seen = new Set<string>();
  const pattern = sourcePattern();

  for (const match of prompt.matchAll(pattern)) {
    const url = match[1];
    const imageChip = match[2];
    const path = match[3] ?? match[4] ?? match[5] ?? match[6];

    if (url) {
      const cleanedUrl = stripTrailingPunctuation(url);
      addUnique(sources, seen, { type: 'url', url: cleanedUrl, origin: 'hook' }, `url:${cleanedUrl}`);
      continue;
    }

    if (imageChip) {
      addUnique(sources, seen, { type: 'clipboard', origin: 'hook' }, 'clipboard');
      continue;
    }

    if (path) {
      const cleanedPath = stripTrailingPunctuation(path);
      addUnique(sources, seen, { type: 'path', path: cleanedPath, origin: 'hook' }, `path:${cleanedPath}`);
    }
  }

  return sources;
}

function sourcePattern(): RegExp {
  const extensions = supportedImageExtensions().map(escapeRegExp).join('|');
  const imagePath = `(?:${extensions})`;
  const doubleQuotedPath = `"([^"]+?${imagePath})"`;
  const singleQuotedPath = `'([^']+?${imagePath})'`;
  const backtickPath = '`([^`]+?' + imagePath + ')`';
  const plainPath = `([^\\s"'` + '`' + `<>),;:]+?${imagePath})`;

  return new RegExp(
    [
      `(${urlPattern})`,
      `(${imageChipPattern})`,
      doubleQuotedPath,
      singleQuotedPath,
      backtickPath,
      plainPath,
    ].join('|'),
    'gi',
  );
}

function stripTrailingPunctuation(value: string): string {
  return value.replace(/[),.;:]+$/g, '');
}

function addUnique(sources: ImageSource[], seen: Set<string>, source: ImageSource, key: string): void {
  if (seen.has(key)) return;
  seen.add(key);
  sources.push(source);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
