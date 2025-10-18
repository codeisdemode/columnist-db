import { useEffect, useState } from 'react';
import { useColumnist } from 'columnist-db-hooks';
import { OpenAIEmbeddingProvider, type OpenAIEmbeddingOptions } from './embedding-provider';

export interface UseOpenAIEmbeddingOptions extends OpenAIEmbeddingOptions {
  table: string;
  enabled?: boolean;
}

export function useOpenAIEmbedding(options: UseOpenAIEmbeddingOptions) {
  const { table, enabled = true, ...embeddingOptions } = options;
  const { db } = useColumnist({ name: 'default' });
  const [provider, setProvider] = useState<OpenAIEmbeddingProvider | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!db || !enabled || !embeddingOptions.apiKey) return;

    setLoading(true);
    
    const embeddingProvider = new OpenAIEmbeddingProvider(embeddingOptions);
    
    // Register the embedder with the database
    db.registerEmbedder(table, (text: string) => 
      embeddingProvider.generateEmbedding(text)
    );

    setProvider(embeddingProvider);
    setLoading(false);

    return () => {
      // Cleanup
      db.registerEmbedder(table, () => Promise.reject(new Error('Embedder unregistered')));
    };
  }, [db, table, enabled, embeddingOptions]);

  return { provider, loading };
}