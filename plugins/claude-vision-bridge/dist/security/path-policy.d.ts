export interface PathPolicyOptions {
    cwd: string;
    homeDir?: string;
    allowedDirectories: string[];
    deniedDirectories: string[];
}
export declare function assertPathAllowed(path: string, options: PathPolicyOptions): string;
