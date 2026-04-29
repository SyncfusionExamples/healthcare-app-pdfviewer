// Minimal IndexedDB helper for storing file blobs under a key
const DB_NAME = 'materials_files_db';
const STORE_NAME = 'files';

function openDb(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = ()=>{
      const db = req.result;
      if(!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error || new Error('IndexedDB open failed'));
  });
}

export async function saveFile(key, blob){
  const db = await openDb();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(blob, key);
    req.onsuccess = ()=> resolve(true);
    req.onerror = ()=> reject(req.error || new Error('saveFile failed'));
  });
}

export async function getFile(key){
  const db = await openDb();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);
    req.onsuccess = ()=> resolve(req.result || null);
    req.onerror = ()=> reject(req.error || new Error('getFile failed'));
  });
}

export async function deleteFile(key){
  const db = await openDb();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(key);
    req.onsuccess = ()=> resolve(true);
    req.onerror = ()=> reject(req.error || new Error('deleteFile failed'));
  });
}

const idbFiles = { saveFile, getFile, deleteFile };
export default idbFiles;
