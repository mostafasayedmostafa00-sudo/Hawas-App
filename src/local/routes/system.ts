import { getLocalDb } from '../sqliteDriver.ts';
import { EXPORTABLE_TABLES, initializeSchemaAndDefaults, uid } from '../schema.ts';
import { clearSampleData, loadSampleData } from '../sampleData.ts';
import { LocalHttpError } from '../httpError.ts';
import { exportJsonTextToDevice, readBackupSnapshot, writeBackupSnapshot } from '../fileStorage.ts';
import { computeElapsedSeconds } from '../../shared/logic.ts';
import type { ActiveTimer } from '../../shared/types.ts';

export interface BackupExportPayload {
  app: 'Brain Sculpting Camp';
  platform: 'android-offline';
  exportedAt: string;
  schemaVersion: string;
  data: Record<string, Array<Record<string, any>>>;
}

export async function getSettings() {
  const db = await getLocalDb();
  const settings = await db.get('SELECT * FROM user_settings WHERE id = 1');
  return { settings };
}

export async function updateSettings(body: any) {
  const db = await getLocalDb();
  const existing = (await db.get<Record<string, any>>('SELECT * FROM user_settings WHERE id = 1')) ?? {};
  const b = body ?? {};
  const now = new Date().toISOString();

  await db.run(
    `UPDATE user_settings SET
      profile_name = ?, profile_bio = ?, theme = ?, week_start_day = ?, date_format = ?, time_format = ?,
      notifications_enabled = ?, daily_focus_start = ?, daily_focus_end = ?, onboarding_completed = ?,
      score_weights_json = ?, ai_enabled = ?, ai_tutor_level = ?, updated_at = ?
    WHERE id = 1`,
    [
      b.profile_name !== undefined ? String(b.profile_name).trim() || 'Learner' : existing.profile_name,
      b.profile_bio !== undefined ? String(b.profile_bio) : existing.profile_bio,
      b.theme ?? existing.theme,
      b.week_start_day ?? existing.week_start_day,
      b.date_format ?? existing.date_format,
      b.time_format ?? existing.time_format,
      b.notifications_enabled !== undefined ? (b.notifications_enabled ? 1 : 0) : existing.notifications_enabled,
      b.daily_focus_start ?? existing.daily_focus_start,
      b.daily_focus_end ?? existing.daily_focus_end,
      b.onboarding_completed !== undefined ? (b.onboarding_completed ? 1 : 0) : existing.onboarding_completed,
      b.score_weights_json !== undefined
        ? typeof b.score_weights_json === 'string'
          ? b.score_weights_json
          : JSON.stringify(b.score_weights_json)
        : existing.score_weights_json,
      b.ai_enabled !== undefined ? (b.ai_enabled ? 1 : 0) : existing.ai_enabled,
      b.ai_tutor_level ?? existing.ai_tutor_level,
      now,
    ]
  );

  return { settings: await db.get('SELECT * FROM user_settings WHERE id = 1') };
}

export async function loadSampleDataRoute() {
  const db = await getLocalDb();
  await loadSampleData(db);
  return { ok: true, settings: await db.get('SELECT * FROM user_settings WHERE id = 1') };
}

export async function clearSampleDataRoute() {
  const db = await getLocalDb();
  await clearSampleData(db);
  return { ok: true, settings: await db.get('SELECT * FROM user_settings WHERE id = 1') };
}

// PERSISTENT TIMERS
export async function listTimers() {
  const db = await getLocalDb();
  const timers = await db.all('SELECT * FROM active_timers');
  return { timers };
}

export async function startTimer(body: any) {
  const db = await getLocalDb();
  const { entity_type, entity_id, entity_title, meta = {} } = body ?? {};
  if (!entity_type || !entity_id || !entity_title) {
    throw new LocalHttpError(400, 'entity_type, entity_id, and entity_title are required.');
  }
  const now = new Date().toISOString();
  const existing = (await db.get('SELECT * FROM active_timers WHERE entity_type = ? AND entity_id = ?', [
    entity_type,
    entity_id,
  ])) as unknown as ActiveTimer | undefined;

  if (existing) {
    await db.run("UPDATE active_timers SET status = 'running', last_resumed_at = ? WHERE id = ?", [now, existing.id]);
    return { timer: await db.get('SELECT * FROM active_timers WHERE id = ?', [existing.id]) };
  }

  const id = uid('tmr');
  await db.run(
    `INSERT INTO active_timers (id, entity_type, entity_id, entity_title, status, started_at, last_resumed_at, accumulated_seconds, meta_json)
     VALUES (?, ?, ?, ?, 'running', ?, ?, 0, ?)`,
    [id, entity_type, entity_id, String(entity_title), now, now, JSON.stringify(meta)]
  );
  return { timer: await db.get('SELECT * FROM active_timers WHERE id = ?', [id]) };
}

export async function pauseTimer(id: string) {
  const db = await getLocalDb();
  const timer = (await db.get('SELECT * FROM active_timers WHERE id = ?', [id])) as unknown as ActiveTimer | undefined;
  if (!timer) throw new LocalHttpError(404, 'Timer not found');
  const elapsed = computeElapsedSeconds(timer, Date.now());
  await db.run("UPDATE active_timers SET status = 'paused', accumulated_seconds = ?, last_resumed_at = ? WHERE id = ?", [
    elapsed,
    new Date().toISOString(),
    id,
  ]);
  return { timer: await db.get('SELECT * FROM active_timers WHERE id = ?', [id]) };
}

export async function resumeTimer(id: string) {
  const db = await getLocalDb();
  const timer = (await db.get('SELECT * FROM active_timers WHERE id = ?', [id])) as unknown as ActiveTimer | undefined;
  if (!timer) throw new LocalHttpError(404, 'Timer not found');
  await db.run("UPDATE active_timers SET status = 'running', last_resumed_at = ? WHERE id = ?", [
    new Date().toISOString(),
    id,
  ]);
  return { timer: await db.get('SELECT * FROM active_timers WHERE id = ?', [id]) };
}

export async function stopTimer(id: string, body: any) {
  const db = await getLocalDb();
  const timer = (await db.get('SELECT * FROM active_timers WHERE id = ?', [id])) as unknown as ActiveTimer | undefined;
  if (!timer) throw new LocalHttpError(404, 'Timer not found');
  const { notes = '', end_page } = body ?? {};
  const totalSeconds = computeElapsedSeconds(timer, Date.now());
  const now = new Date().toISOString();

  if (timer.entity_type === 'task') {
    await db.run(
      'INSERT INTO task_sessions (id, task_id, started_at, ended_at, duration_seconds, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [uid('ts'), timer.entity_id, timer.started_at, now, totalSeconds, String(notes)]
    );
  } else if (timer.entity_type === 'book') {
    const book = await db.get<{ current_page: number; total_pages: number | null }>(
      'SELECT current_page, total_pages FROM books WHERE id = ?',
      [timer.entity_id]
    );
    const startPage = book?.current_page ?? 0;
    const finalEndPage = end_page !== undefined ? Math.max(startPage, Number(end_page)) : startPage;
    const pagesRead = Math.max(0, finalEndPage - startPage);
    await db.run(
      'INSERT INTO reading_sessions (id, book_id, started_at, ended_at, duration_seconds, start_page, end_page, pages_read, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [uid('rs'), timer.entity_id, timer.started_at, now, totalSeconds, startPage, finalEndPage, pagesRead, String(notes), now]
    );
    if (book) {
      const pct = book.total_pages ? Math.min(100, Math.round((finalEndPage / book.total_pages) * 100)) : undefined;
      await db.run(
        'UPDATE books SET current_page = ?, progress_percent = COALESCE(?, progress_percent), updated_at = ? WHERE id = ?',
        [finalEndPage, pct ?? null, now, timer.entity_id]
      );
    }
  } else if (timer.entity_type === 'study_topic') {
    await db.run(
      'INSERT INTO study_sessions (id, topic_id, started_at, ended_at, duration_seconds, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [uid('ss'), timer.entity_id, timer.started_at, now, totalSeconds, String(notes)]
    );
    await db.run(
      `UPDATE study_topics SET study_seconds = study_seconds + ?, last_studied_at = ?, status = CASE WHEN status = 'not_started' THEN 'in_progress' ELSE status END WHERE id = ?`,
      [totalSeconds, now, timer.entity_id]
    );
  }

  await db.run('DELETE FROM active_timers WHERE id = ?', [id]);
  return { ok: true, durationSeconds: totalSeconds };
}

export async function deleteTimer(id: string) {
  await (await getLocalDb()).run('DELETE FROM active_timers WHERE id = ?', [id]);
  return { ok: true };
}

// NOTIFICATIONS
export async function listNotifications() {
  const db = await getLocalDb();
  const today = new Date().toISOString().slice(0, 10);
  const stored = await db.all<any>('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50');

  const overdueRow = await db.get<{ c: number }>(
    "SELECT COUNT(*) as c FROM tasks WHERE due_date < ? AND status IN ('todo','in_progress') AND parent_task_id IS NULL",
    [today]
  );
  const dueReviewRow = await db.get<{ c: number }>(
    "SELECT COUNT(*) as c FROM study_topics WHERE next_review_date <= ? AND status != 'completed'",
    [today]
  );
  const dueVocabRow = await db.get<{ c: number }>(
    'SELECT COUNT(*) as c FROM vocabulary_items WHERE next_review_date <= ? AND mastered = 0',
    [today]
  );

  const overdueCount = overdueRow?.c ?? 0;
  const dueReviewCount = dueReviewRow?.c ?? 0;
  const dueVocabCount = dueVocabRow?.c ?? 0;

  const liveAlerts: any[] = [];
  if (overdueCount > 0) {
    liveAlerts.push({
      id: 'live_overdue',
      title: `${overdueCount} Overdue Task${overdueCount > 1 ? 's' : ''}`,
      message: 'Review overdue tasks on Home or Tasks to reschedule, carry forward, or skip.',
      category: 'tasks',
      severity: 'warning',
      link_section: 'home',
      is_read: 0,
      created_at: new Date().toISOString(),
    });
  }
  if (dueReviewCount > 0) {
    liveAlerts.push({
      id: 'live_study_reviews',
      title: `${dueReviewCount} Spaced Repetition Review${dueReviewCount > 1 ? 's' : ''} Due`,
      message: 'Topics scheduled for revision today in Study & Learning.',
      category: 'study',
      severity: 'info',
      link_section: 'study',
      is_read: 0,
      created_at: new Date().toISOString(),
    });
  }
  if (dueVocabCount > 0) {
    liveAlerts.push({
      id: 'live_vocab',
      title: `${dueVocabCount} Vocabulary Card${dueVocabCount > 1 ? 's' : ''} Ready`,
      message: 'Spaced repetition vocabulary cards due in English Learning.',
      category: 'english',
      severity: 'info',
      link_section: 'english',
      is_read: 0,
      created_at: new Date().toISOString(),
    });
  }

  return { notifications: [...liveAlerts, ...stored] };
}

export async function markNotificationRead(id: string) {
  await (await getLocalDb()).run('UPDATE notifications SET is_read = 1 WHERE id = ?', [id]);
  return { ok: true };
}

// BACKUPS, EXPORT & IMPORT (100% On-Device JSON Snapshots & Portability)
export async function buildFullJsonExport(): Promise<BackupExportPayload> {
  const db = await getLocalDb();
  const data: Record<string, Array<Record<string, any>>> = {};
  for (const table of EXPORTABLE_TABLES) {
    data[table] = await db.all<Record<string, any>>(`SELECT * FROM ${table}`);
  }
  return {
    app: 'Brain Sculpting Camp',
    platform: 'android-offline',
    exportedAt: new Date().toISOString(),
    schemaVersion: '001',
    data,
  };
}

export async function importFullJsonBackup(payload: unknown): Promise<{ ok: true; restoredTables: number; restoredRows: number }> {
  if (!payload || typeof payload !== 'object' || !('data' in payload) || typeof (payload as any).data !== 'object') {
    throw new LocalHttpError(400, 'Invalid backup file: missing "data" object.');
  }
  const incomingData = (payload as BackupExportPayload).data;
  const db = await getLocalDb();

  let restoredTables = 0;
  let restoredRows = 0;

  await db.exec('PRAGMA foreign_keys = OFF;');
  try {
    await db.transaction(async () => {
      // Clear tables in reverse dependency order
      for (const table of [...EXPORTABLE_TABLES].reverse()) {
        if (Array.isArray(incomingData[table])) {
          await db.run(`DELETE FROM ${table}`);
        }
      }

      // Restore tables in schema creation order
      for (const table of EXPORTABLE_TABLES) {
        const rows = incomingData[table];
        if (!Array.isArray(rows) || rows.length === 0) continue;

        const tableInfo = await db.all<{ name: string }>(`PRAGMA table_info(${table})`);
        const allowedCols = new Set(tableInfo.map((c) => c.name));

        restoredTables += 1;
        for (const row of rows) {
          if (!row || typeof row !== 'object') continue;
          const cols = Object.keys(row).filter((col) => allowedCols.has(col));
          if (cols.length === 0) continue;
          const placeholders = cols.map(() => '?').join(', ');
          const sql = `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`;
          const values = cols.map((c) => (row[c] === undefined ? null : row[c]));
          await db.run(sql, values);
          restoredRows += 1;
        }
      }
    });
  } finally {
    await db.exec('PRAGMA foreign_keys = ON;');
  }

  // Ensure singleton settings/categories exist if imported payload omitted them
  await initializeSchemaAndDefaults(db);

  return { ok: true, restoredTables, restoredRows };
}

export async function listBackups() {
  const db = await getLocalDb();
  const backups = await db.all('SELECT * FROM backup_metadata ORDER BY created_at DESC');
  return { backups };
}

export async function createBackupSnapshot(body: any) {
  const db = await getLocalDb();
  const { notes = 'Manual backup' } = body ?? {};
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `bsc_backup_${stamp}.json`;
  const payload = await buildFullJsonExport();
  const jsonText = JSON.stringify(payload, null, 2);
  const { path, size } = await writeBackupSnapshot(fileName, jsonText);
  const id = uid('bkp');
  const now = new Date().toISOString();
  await db.run(
    'INSERT INTO backup_metadata (id, file_name, file_path, size_bytes, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, fileName, path, size, String(notes), now]
  );
  return { backup: await db.get('SELECT * FROM backup_metadata WHERE id = ?', [id]) };
}

export async function restoreBackupSnapshot(id: string) {
  const db = await getLocalDb();
  const row = await db.get<{ id: string; file_name: string }>('SELECT * FROM backup_metadata WHERE id = ?', [id]);
  if (!row) throw new LocalHttpError(404, 'Backup snapshot not found.');

  const rawJson = await readBackupSnapshot(row.file_name);
  if (!rawJson) throw new LocalHttpError(404, 'Backup snapshot content not found on device.');

  // Save safety snapshot before replacing state
  const safetyName = `pre_restore_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const safetyPayload = await buildFullJsonExport();
  const safetyText = JSON.stringify(safetyPayload, null, 2);
  const safetyWritten = await writeBackupSnapshot(safetyName, safetyText);

  const parsed = JSON.parse(rawJson);
  await importFullJsonBackup(parsed);

  // Record safety snapshot in metadata
  await db.run(
    'INSERT INTO backup_metadata (id, file_name, file_path, size_bytes, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [uid('bkp'), safetyName, safetyWritten.path, safetyWritten.size, `Pre-restore safety before ${row.file_name}`, new Date().toISOString()]
  );

  return { ok: true, restoredFrom: row.file_name, safetyBackup: safetyName };
}

export async function downloadBackupSnapshot(id: string) {
  const db = await getLocalDb();
  const row = await db.get<{ file_name: string }>('SELECT file_name FROM backup_metadata WHERE id = ?', [id]);
  if (!row) throw new LocalHttpError(404, 'Backup snapshot not found.');
  const rawJson = await readBackupSnapshot(row.file_name);
  if (!rawJson) throw new LocalHttpError(404, 'Backup snapshot content not found on device.');
  await exportJsonTextToDevice(row.file_name, rawJson);
  return { ok: true, fileName: row.file_name };
}
