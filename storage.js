const database = new Promise((resolve, reject) => {
  const request = indexedDB.open('folio-reader', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('documents', { keyPath: 'id' });
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
database.catch(() => {});

async function transaction(mode, action) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('documents', mode);
    const request = action(tx.objectStore('documents'));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Storage transaction aborted'));
  });
}

export const readDocuments = () => transaction('readonly', store => store.getAll());
export const saveDocument = doc => transaction('readwrite', store => store.put(doc));
export const deleteDocument = id => transaction('readwrite', store => store.delete(id));
export function readPreferences() {
  try { return JSON.parse(localStorage.getItem('folio-preferences') || '{}'); }
  catch { return {}; }
}
export function savePreferences(value) {
  try { localStorage.setItem('folio-preferences', JSON.stringify(value)); return true; }
  catch { return false; }
}
