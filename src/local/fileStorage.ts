import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const ROOT_DIR = 'bsc_storage';
const BACKUP_DIR = 'bsc_backups';
const IDB_NAME = 'bsc_offline_files_store';
const IDB_STORE = 'files';

function openFileIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPutBlob(key: string, blob: Blob): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openFileIdb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGetBlob(key: string): Promise<Blob | null> {
  if (typeof indexedDB === 'undefined') return null;
  const db = await openFileIdb();
  return await new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbDeleteBlob(key: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openFileIdb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function base64ToUint8Array(base64: string): Uint8Array {
  const clean = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64;
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function saveUploadedFile(
  subdir: 'books' | 'covers' | 'recordings' | 'attachments' | 'photos',
  file: Blob,
  originalName: string
): Promise<string> {
  const safeName = `${Date.now()}_${sanitizeFileName(originalName || 'file.bin')}`;
  const relPath = `${subdir}/${safeName}`;

  if (Capacitor.isNativePlatform()) {
    const base64 = await blobToBase64(file);
    await Filesystem.writeFile({
      directory: Directory.Data,
      path: `${ROOT_DIR}/${relPath}`,
      data: base64,
      recursive: true,
    });
    return relPath;
  }

  await idbPutBlob(relPath, file);
  return relPath;
}

export async function deleteStoredFile(relPath: string | null | undefined): Promise<void> {
  if (!relPath) return;
  if (Capacitor.isNativePlatform()) {
    try {
      await Filesystem.deleteFile({
        directory: Directory.Data,
        path: `${ROOT_DIR}/${relPath}`,
      });
    } catch {
      // ignore missing file
    }
    return;
  }
  await idbDeleteBlob(relPath).catch(() => undefined);
}

export async function resolveStorageUrl(relPath: string | null | undefined): Promise<string | null> {
  if (!relPath) return null;
  if (/^(https?:|blob:|data:)/i.test(relPath)) return relPath;

  if (Capacitor.isNativePlatform()) {
    try {
      const { uri } = await Filesystem.getUri({
        directory: Directory.Data,
        path: `${ROOT_DIR}/${relPath}`,
      });
      return Capacitor.convertFileSrc(uri);
    } catch {
      return null;
    }
  }

  const blob = await idbGetBlob(relPath);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

export async function readStorageBytes(relPath: string): Promise<Uint8Array | null> {
  if (Capacitor.isNativePlatform()) {
    try {
      const res = await Filesystem.readFile({
        directory: Directory.Data,
        path: `${ROOT_DIR}/${relPath}`,
      });
      if (typeof res.data === 'string') {
        return base64ToUint8Array(res.data);
      }
      if (res.data instanceof Blob) {
        return new Uint8Array(await res.data.arrayBuffer());
      }
      return null;
    } catch {
      return null;
    }
  }

  const blob = await idbGetBlob(relPath);
  if (!blob) return null;
  return new Uint8Array(await blob.arrayBuffer());
}

export async function writeBackupSnapshot(fileName: string, jsonText: string): Promise<{ path: string; size: number }> {
  const bytes = new TextEncoder().encode(jsonText).byteLength;
  if (Capacitor.isNativePlatform()) {
    await Filesystem.writeFile({
      directory: Directory.Data,
      path: `${BACKUP_DIR}/${fileName}`,
      data: jsonText,
      encoding: Encoding.UTF8,
      recursive: true,
    });
    return { path: `${BACKUP_DIR}/${fileName}`, size: bytes };
  }

  await idbPutBlob(`backup:${fileName}`, new Blob([jsonText], { type: 'application/json' }));
  return { path: `idb://backup:${fileName}`, size: bytes };
}

export async function readBackupSnapshot(fileName: string): Promise<string | null> {
  if (Capacitor.isNativePlatform()) {
    try {
      const res = await Filesystem.readFile({
        directory: Directory.Data,
        path: `${BACKUP_DIR}/${fileName}`,
        encoding: Encoding.UTF8,
      });
      return typeof res.data === 'string' ? res.data : await res.data.text();
    } catch {
      return null;
    }
  }

  const blob = await idbGetBlob(`backup:${fileName}`);
  return blob ? await blob.text() : null;
}

export async function exportJsonTextToDevice(fileName: string, jsonText: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const res = await Filesystem.writeFile({
      directory: Directory.Cache,
      path: fileName,
      data: jsonText,
      encoding: Encoding.UTF8,
      recursive: true,
    });
    try {
      await Share.share({
        title: 'Brain Sculpting Camp Backup',
        text: 'Exported Brain Sculpting Camp JSON backup',
        url: res.uri,
        dialogTitle: 'Save or Share JSON Backup',
      });
      return;
    } catch {
      // Fallback: also persist inside Documents folder if share dialog dismissed
      await Filesystem.writeFile({
        directory: Directory.Documents,
        path: `BrainSculptingCamp/${fileName}`,
        data: jsonText,
        encoding: Encoding.UTF8,
        recursive: true,
      });
      return;
    }
  }

  // Web browser download
  const blob = new Blob([jsonText], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
