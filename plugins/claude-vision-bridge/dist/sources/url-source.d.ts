import type { ResolvedImageSource } from '../core/types.js';
import { type UrlPolicyOptions } from '../security/url-policy.js';
export interface UrlDownloadOptions extends UrlPolicyOptions {
    maxImageBytes: number;
    timeoutMs: number;
    maxRedirects: number;
}
export declare function downloadUrlImage(urlText: string, options: UrlDownloadOptions): Promise<ResolvedImageSource>;
