export interface UrlPolicyOptions {
    allowHttpUrls: boolean;
    allowPrivateNetworkUrls: boolean;
}
export declare function assertUrlAllowed(url: URL, options: UrlPolicyOptions): Promise<void>;
export declare function isPrivateAddress(address: string): boolean;
