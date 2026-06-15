import type { PluginConfig, ProviderId } from '../core/types.js';
import type { VisionProvider } from './base.js';
export declare function buildProviders(config: PluginConfig): VisionProvider[];
export declare function buildProvider(config: PluginConfig, id: ProviderId): VisionProvider | undefined;
