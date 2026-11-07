import type { Activity } from '../types';

/** Uploaded activities live in IndexedDB, so they survive a reload and never leave the browser. */
const open = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('activity-in-frame', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('activities', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const req = fn(db.transaction('activities', mode).objectStore('activities'));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const loadActivities = () => run<Activity[]>('readonly', (s) => s.getAll());
export const saveActivity = (a: Activity) => run('readwrite', (s) => s.put(a));
export const removeActivity = (id: string) => run('readwrite', (s) => s.delete(id));
