export class ProviderError extends Error {
    category;
    constructor(category, message) {
        super(`${category}: ${message}`);
        this.category = category;
        this.name = 'ProviderError';
    }
}
//# sourceMappingURL=base.js.map