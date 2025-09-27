# Sync Adapters for Columnist

Columnist provides a flexible synchronization system that allows you to sync your local IndexedDB data with external databases and services.

## Available Adapters

### Firebase Adapter
Sync with Google Firebase Firestore database.

```typescript
import { Columnist, FirebaseSyncAdapter } from 'columnist-db-core';

const db = await Columnist.init('my-app', { schema });

// Register Firebase sync adapter
await db.registerSyncAdapter('firebase', 'firebase', {
  apiKey: 'your-api-key',
  authDomain: 'your-project.firebaseapp.com',
  projectId: 'your-project-id',
  // Optional authentication
  auth: {
    email: 'user@example.com',
    password: 'password123'
  }
});

// Start synchronization
await db.startSync('firebase');
```

### Supabase Adapter
Sync with Supabase PostgreSQL database.

```typescript
import { Columnist, SupabaseSyncAdapter } from 'columnist-db-core';

const db = await Columnist.init('my-app', { schema });

// Register Supabase sync adapter
await db.registerSyncAdapter('supabase', 'supabase', {
  supabaseUrl: 'https://your-project.supabase.co',
  supabaseKey: 'your-anon-key'
});

// Start synchronization
await db.startSync('supabase');
```

### REST API Adapter
Sync with any RESTful API.

```typescript
import { Columnist, RESTfulSyncAdapter } from 'columnist-db-core';

const db = await Columnist.init('my-app', { schema });

// Register REST API sync adapter
await db.registerSyncAdapter('api', 'rest', {
  baseURL: 'https://api.example.com',
  auth: {
    type: 'bearer',
    token: 'your-token'
  }
});

// Start synchronization
await db.startSync('api');
```

## Sync Options

All adapters support the following options:

```typescript
{
  // Sync interval in milliseconds (default: 5000)
  interval: 10000,
  
  // Enable real-time synchronization (default: false)
  realtime: true,
  
  // Conflict resolution strategy (default: 'local-wins')
  conflictStrategy: 'remote-wins', // or 'merge', 'custom'
  
  // Custom conflict resolver
  conflictResolver: (local, remote) => {
    // Your custom conflict resolution logic
    return { ...local, ...remote };
  },
  
  // Tables to sync (default: all tables)
  tables: ['messages', 'users'],
  
  // Maximum retry attempts (default: 3)
  maxRetries: 5,
  
  // Backoff strategy (default: 'exponential')
  backoffStrategy: 'linear'
}
```

## Real-time Synchronization

When real-time mode is enabled, changes are synchronized immediately:

```typescript
// Enable real-time sync
await db.registerSyncAdapter('firebase', 'firebase', {
  // ...firebase config
  realtime: true,
  interval: 0 // Disable periodic sync when using real-time
});

// Changes will be synced immediately
await db.insert({ content: 'Hello world' }, 'messages');
```

## Conflict Resolution

Columnist provides multiple conflict resolution strategies:

1. **Local Wins**: Local changes take precedence
2. **Remote Wins**: Remote changes take precedence  
3. **Merge**: Combine local and remote changes
4. **Custom**: Implement your own resolution logic

```typescript
// Custom conflict resolution
await db.registerSyncAdapter('firebase', 'firebase', {
  // ...config
  conflictStrategy: 'custom',
  conflictResolver: (local, remote) => {
    // Prefer remote for timestamps, local for content
    return {
      ...local,
      timestamp: remote.timestamp,
      updatedAt: new Date()
    };
  }
});
```

## Monitoring Sync Status

Monitor synchronization status and errors:

```typescript
// Get sync status
const status = db.getSyncStatus('firebase');
console.log('Sync status:', status);

// Listen for sync events
const unsubscribe = db.getSyncManager()
  .getAdapter('firebase')
  ?.onSyncEvent((event) => {
    console.log('Sync event:', event.type, event.error);
  });

// Stop listening
unsubscribe?.();
```

## Error Handling

Sync adapters automatically handle network errors and retries:

```typescript
try {
  await db.startSync('firebase');
} catch (error) {
  console.error('Sync failed to start:', error);
}

// Sync events include error information
db.getSyncManager()
  .getAdapter('firebase')
  ?.onSyncEvent((event) => {
    if (event.type === 'sync-error') {
      console.error('Sync error:', event.error);
    }
  });
```

## Multiple Sync Adapters

You can register multiple sync adapters for different purposes:

```typescript
// Sync with multiple services
await db.registerSyncAdapter('primary', 'firebase', { /* config */ });
await db.registerSyncAdapter('backup', 'rest', { /* config */ });

// Start all adapters
await db.startSync();

// Or start specific adapters
await db.startSync('primary');
```