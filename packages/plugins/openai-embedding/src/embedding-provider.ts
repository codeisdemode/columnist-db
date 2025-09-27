import type { OpenAI } from 'openai';

export interface OpenAIEmbeddingOptions {
  apiKey: string;
  model?: string;
  dimensions?: number;
  organization?: string;
}

export class OpenAIEmbeddingProvider {
  private openai: OpenAI;
  private model: string;
  private dimensions: number;

  constructor(options: OpenAIEmbeddingOptions) {
    // Dynamic import to avoid bundling issues
    this.openai = new (require('openai').OpenAI)({
      apiKey: options.apiKey,
      organization: options.organization
    });
    
    this.model = options.model || 'text-embedding-ada-002';
    this.dimensions = options.dimensions || 1536;
  }

  async generateEmbedding(text: string): Promise<Float32Array> {
    try {
      const response = await this.openai.embeddings.create({
        model: this.model,
        input: text,
        encoding_format: 'float'
      });

      const embedding = response.data[0]?.embedding;
      if (!embedding) {
        throw new Error('No embedding returned from OpenAI');
      }

      return new Float32Array(embedding);
    } catch (error) {
      console.error('OpenAI embedding error:', error);
      throw error;
    }
  }

  getDimensions(): number {
    return this.dimensions;
  }

  getModel(): string {
    return this.model;
  }
}