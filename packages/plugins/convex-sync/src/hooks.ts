import { useEffect, useState } from 'react';
import { useColumnist } from 'columnist-db-hooks';
import { ConvexSyncAdapter, type ConvexSyncOptions } from './convex-adapter';

export interface UseConvexSyncOptions extends ConvexSyncOptions {
  enabled?: boolean;
}

export function useConvexSync(options: UseConvexSyncOptions) {
  const { enabled = true, ...syncOptions } = options;
  const { db } = useColumnist({ name: 'default' });
  const [status, setStatus] = useState<any>(null);

  useEffect(() => {
    if (!db || !enabled || !syncOptions.convexClient) return;

    const adapter = new ConvexSyncAdapter({
      ...syncOptions,
      db
    });

    const updateStatus = () => setStatus(adapter.getStatus());
    
    const unsubscribe = (adapter as any).onSyncEvent((event: any) => {
      if (event.type === 'sync-start' || event.type === 'sync-complete' || event.type === 'sync-error') {
        updateStatus();
      }
    });

    (adapter as any).start().catch(console.error);

    return () => {
      unsubscribe();
      (adapter as any).stop().catch(console.error);
    };
  }, [db, enabled, syncOptions]);

  return { status };
}