import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, parse, resolve, sep } from 'node:path';

export interface PathPolicyOptions {
  cwd: string;
  homeDir?: string;
  allowedDirectories: string[];
  deniedDirectories: string[];
}

const sensitiveDirectoryNames = new Set(['.git', '.ssh', 'node_modules', 'dist', 'build']);
const sensitiveFilePatterns = [/^\.env/i, /\.pem$/i, /\.key$/i];

const unixSystemRoots = [
  '/bin',
  '/boot',
  '/dev',
  '/etc',
  '/lib',
  '/lib64',
  '/proc',
  '/root',
  '/run',
  '/sbin',
  '/sys',
  '/usr',
  '/var',
  '/private',
  '/opt',
  '/System',
  '/Library',
];

const windowsSystemRoots = [
  ':\\windows',
  ':\\program files',
  ':\\program files (x86)',
  ':\\programdata',
];

export function assertPathAllowed(path: string, options: PathPolicyOptions): string {
  const real = realpathSync(resolve(options.cwd, path));
  const cwd = realpathSync(options.cwd);
  const home = realpathSync(options.homeDir ?? homedir());
  const allowedRoots = [
    cwd,
    home,
    ...options.allowedDirectories.map((directory) => realpathSync(directory)),
  ];
  const deniedRoots = options.deniedDirectories.map((directory) => realpathSync(directory));

  if (isSystemPath(real)) {
    throw new Error(`Path denied by system directory policy: ${real}`);
  }
  if (isSensitivePath(real)) {
    throw new Error(`Path denied by sensitive path policy: ${real}`);
  }
  if (deniedRoots.some((root) => isSameOrChild(real, root))) {
    throw new Error(`Path denied by configured denied directory: ${real}`);
  }
  if (!allowedRoots.some((root) => isSameOrChild(real, root))) {
    throw new Error(`Path outside allowed roots: ${real}`);
  }

  return real;
}

function isSameOrChild(path: string, root: string): boolean {
  const comparablePath = normalizeForCompare(path);
  const comparableRoot = trimTrailingSeparators(normalizeForCompare(root));
  const rootPath = parse(comparableRoot).root;

  if (comparablePath === comparableRoot) return true;
  if (comparableRoot === rootPath) return comparablePath.startsWith(comparableRoot);

  return comparablePath.startsWith(`${comparableRoot}${sep}`);
}

function normalizeForCompare(path: string): string {
  return process.platform === 'win32' ? path.toLowerCase() : path;
}

function trimTrailingSeparators(path: string): string {
  const root = parse(path).root;
  let trimmed = path;
  while (trimmed.length > root.length && trimmed.endsWith(sep)) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed;
}

function isSensitivePath(path: string): boolean {
  const parts = path.split(/[\\/]/).filter(Boolean);
  if (parts.some((part) => sensitiveDirectoryNames.has(part.toLowerCase()))) {
    return true;
  }
  if (parts.some((part) => part.toLowerCase().startsWith('.env'))) {
    return true;
  }
  return sensitiveFilePatterns.some((pattern) => pattern.test(basename(path)));
}

function isSystemPath(path: string): boolean {
  if (process.platform === 'win32') {
    const normalized = path.toLowerCase().replaceAll('/', '\\');
    return windowsSystemRoots.some((root) => normalized.includes(root));
  }

  return unixSystemRoots.some((root) => isSameOrChild(path, root));
}
