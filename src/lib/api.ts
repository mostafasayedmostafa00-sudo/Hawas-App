import { dispatchLocalApi } from '../local/router.ts';
import { exportJsonTextToDevice } from '../local/fileStorage.ts';

export const api = {
  get: <T>(url: string) => dispatchLocalApi<T>('GET', url),
  post: <T>(url: string, body?: unknown) => dispatchLocalApi<T>('POST', url, body),
  put: <T>(url: string, body?: unknown) => dispatchLocalApi<T>('PUT', url, body),
  del: <T>(url: string) => dispatchLocalApi<T>('DELETE', url),
  upload: <T>(url: string, formData: FormData) => dispatchLocalApi<T>('POST', url, formData),
};

export async function exportJsonBackup(): Promise<void> {
  const payload = await api.get<Record<string, unknown>>('/api/system/export/json');
  const fileName = `brain_sculpting_camp_export_${new Date().toISOString().slice(0, 10)}.json`;
  await exportJsonTextToDevice(fileName, JSON.stringify(payload, null, 2));
}

export async function importJsonBackup(file: File): Promise<{ ok: true; restoredTables: number; restoredRows: number }> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Selected file is not valid JSON.');
  }
  return api.post<{ ok: true; restoredTables: number; restoredRows: number }>('/api/system/import/json', parsed);
}

export async function downloadSnapshot(id: string): Promise<void> {
  await api.get(`/api/system/backups/${id}/download`);
}
