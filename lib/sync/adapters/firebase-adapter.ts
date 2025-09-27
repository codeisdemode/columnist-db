import { BaseSyncAdapter, SyncOptions, ChangeSet, SyncEvent } from '../base-adapter';
import { ColumnistDB } from '../../columnist';

export interface FirebaseSyncConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  databaseURL?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  /** Firebase collection prefix (default: 'columnist_') */
  collectionPrefix?: string;
  /** Authentication method */
  auth?: {
    email: string;
    password: string;
  } | {
    token: string;
  };
}

export class FirebaseSyncAdapter extends BaseSyncAdapter {
  private config: FirebaseSyncConfig;
  private firestore: any;
  private auth: any;
  private realtimeListeners: Map<string, () => void> = new Map();

  constructor(db: ColumnistDB, options: FirebaseSyncConfig & SyncOptions) {
    super(db, options);
    this.config = options;
  }

  async initialize(): Promise<void> {
    try {
      // Dynamically import Firebase
      const { initializeApp } = await import('firebase/app');
      const { getFirestore, collection, doc, setDoc, getDocs, onSnapshot } = await import('firebase/firestore');
      const { getAuth, signInWithEmailAndPassword, signInWithCustomToken } = await import('firebase/auth');

      // Initialize Firebase app
      const app = initializeApp({
        apiKey: this.config.apiKey,
        authDomain: this.config.authDomain,
        projectId: this.config.projectId,
        databaseURL: this.config.databaseURL,
        storageBucket: this.config.storageBucket,
        messagingSenderId: this.config.messagingSenderId,
        appId: this.config.appId
      });

      this.firestore = getFirestore(app);
      this.auth = getAuth(app);

      // Authenticate if credentials provided
      if (this.config.auth) {
        if ('email' in this.config.auth) {
          await signInWithEmailAndPassword(
            this.auth,
            this.config.auth.email,
            this.config.auth.password
          );
        } else if ('token' in this.config.auth) {
          await signInWithCustomToken(this.auth, this.config.auth.token);
        }
      }

      this.emit({ type: 'sync-start' });
    } catch (error) {
      this.emit({ 
        type: 'sync-error', 
        error: error instanceof Error ? error : new Error('Firebase initialization failed') 
      });
      throw error;
    }
  }

  async pushChanges(changes: ChangeSet): Promise<void> {
    if (!this.firestore) throw new Error('Firebase not initialized');

    const { setDoc, doc } = await import('firebase/firestore');
    const collectionPrefix = this.config.collectionPrefix || 'columnist_';

    try {
      // Push inserts
      for (const insert of changes.inserts) {
        const { _table, id, ...data } = insert;
        if (_table && id) {
          const collectionName = `${collectionPrefix}${_table}`;
          await setDoc(doc(this.firestore, collectionName, id.toString()), {
            ...data,
            _lastModified: new Date().toISOString(),
            _source: 'local'
          });
        }
      }

      // Push updates
      for (const update of changes.updates) {
        const { _table, id, ...data } = update;
        if (_table && id) {
          const collectionName = `${collectionPrefix}${_table}`;
          await setDoc(doc(this.firestore, collectionName, id.toString()), {
            ...data,
            _lastModified: new Date().toISOString(),
            _source: 'local'
          }, { merge: true });
        }
      }

      // Push deletes
      for (const del of changes.deletes) {
        if (typeof del === 'object' && '_table' in del && 'id' in del) {
          const collectionName = `${collectionPrefix}${(del as any)._table}`;
          const { deleteDoc } = await import('firebase/firestore');
          await deleteDoc(doc(this.firestore, collectionName, (del as any).id.toString()));
        } else if (typeof del === 'number') {
          console.warn('Simple numeric delete ID without table specified - cannot delete from Firebase');
        }
      }

    } catch (error) {
      this.emit({ 
        type: 'sync-error', 
        error: error instanceof Error ? error : new Error('Firebase push failed') 
      });
      throw error;
    }
  }

  async pullChanges(): Promise<ChangeSet> {
    if (!this.firestore) throw new Error('Firebase not initialized');

    const { getDocs, collection, query, where, orderBy } = await import('firebase/firestore');
    const collectionPrefix = this.config.collectionPrefix || 'columnist_';
    const changes: ChangeSet = {
      inserts: [],
      updates: [],
      deletes: [],
      timestamp: new Date()
    };

    try {
      // Get all tables from schema
      const schema = this.db.getSchema();
      const tables = this.options.tables || Object.keys(schema);

      for (const table of tables) {
        const collectionName = `${collectionPrefix}${table}`;
        const q = query(
          collection(this.firestore, collectionName),
          orderBy('_lastModified', 'desc')
        );

        const snapshot = await getDocs(q);
        
        for (const doc of snapshot.docs) {
          const data = doc.data();
          
          // Skip changes that originated locally
          if (data._source === 'local') continue;

          const record = {
            ...data,
            id: parseInt(doc.id),
            _table: table
          };

          // Check if this is an update or insert
          changes.updates.push(record);
        }
      }

    } catch (error) {
      this.emit({ 
        type: 'sync-error', 
        error: error instanceof Error ? error : new Error('Firebase pull failed') 
      });
      throw error;
    }

    return changes;
  }

  protected async setupRealtimeListeners(): Promise<void> {
    if (!this.firestore || !this.options.realtime) return;

    const { collection, onSnapshot, query, orderBy } = await import('firebase/firestore');
    const collectionPrefix = this.config.collectionPrefix || 'columnist_';
    const schema = this.db.getSchema();
    const tables = this.options.tables || Object.keys(schema);

    for (const table of tables) {
      const collectionName = `${collectionPrefix}${table}`;
      const q = query(
        collection(this.firestore, collectionName),
        orderBy('_lastModified', 'desc')
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added' || change.type === 'modified') {
            const data = change.doc.data();
            
            // Skip changes that originated locally
            if (data._source === 'local') return;

            this.emit({
              type: 'change-detected',
              table,
              data: {
                type: change.type === 'added' ? 'insert' : 'update',
                record: { ...data, id: parseInt(change.doc.id) }
              }
            });

            // Trigger immediate sync for real-time changes
            this.sync().catch(console.error);
          }
        });
      });

      this.realtimeListeners.set(table, unsubscribe);
    }
  }

  protected teardownRealtimeListeners(): void {
    for (const unsubscribe of this.realtimeListeners.values()) {
      unsubscribe();
    }
    this.realtimeListeners.clear();
  }

  dispose(): void {
    this.teardownRealtimeListeners();
    super.dispose();
  }
}