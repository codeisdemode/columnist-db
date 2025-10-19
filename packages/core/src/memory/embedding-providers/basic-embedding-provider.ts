// Basic Embedding Provider
// A simple embedding provider that uses the built-in basic embedding method

import { EmbeddingProvider } from '../types';

export class BasicEmbeddingProvider implements EmbeddingProvider {
  private dimensions: number = 128;

  async generateEmbedding(text: string): Promise<Float32Array> {
    // Simple text embedding using character frequency (same as built-in method)
    const embedding = new Array(this.dimensions).fill(0);

    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i) % this.dimensions;
      embedding[charCode] += 1;
    }

    // Normalize the vector
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      const normalized = embedding.map(val => val / magnitude);
      return new Float32Array(normalized);
    }

    return new Float32Array(embedding);
  }

  getDimensions(): number {
    return this.dimensions;
  }

  getModel(): string {
    return 'basic-character-frequency';
  }
}