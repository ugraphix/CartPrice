export class BaseSourceAdapter {
  constructor({ source }) {
    this.source = source;
  }

  async searchProducts(_params) {
    throw new Error("searchProducts() must be implemented");
  }

  async getProductDetails(_params) {
    throw new Error("getProductDetails() must be implemented");
  }

  normalizeProduct(_rawProduct, _context) {
    throw new Error("normalizeProduct() must be implemented");
  }

  async validateSourceAccess() {
    throw new Error("validateSourceAccess() must be implemented");
  }

  getRateLimitPolicy() {
    throw new Error("getRateLimitPolicy() must be implemented");
  }
}
