import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { setCustomSqlDriver } from '../src/local/sqliteDriver.ts';
import { initializeSchemaAndDefaults, type SqlDriver } from '../src/local/schema.ts';
import { api } from '../src/lib/api.ts';
import { buildFullJsonExport, importFullJsonBackup } from '../src/local/routes/system.ts';
import { LocalHttpError } from '../src/local/httpError.ts';

function createNodeSqliteDriver(): { driver: SqlDriver; rawDb: DatabaseSync } {
  const rawDb = new DatabaseSync(':memory:');
  const driver: SqlDriver = {
    kind: 'node-sqlite',
    async exec(sql: string) {
      rawDb.exec(sql);
    },
    async run(sql: string, params: unknown[] = []) {
      const stmt = rawDb.prepare(sql);
      stmt.run(...(params as any[]));
    },
    async all<T = Record<string, any>>(sql: string, params: unknown[] = []) {
      const stmt = rawDb.prepare(sql);
      return stmt.all(...(params as any[])) as T[];
    },
    async get<T = Record<string, any>>(sql: string, params: unknown[] = []) {
      const stmt = rawDb.prepare(sql);
      return stmt.get(...(params as any[])) as T | undefined;
    },
    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      rawDb.exec('BEGIN;');
      try {
        const res = await fn();
        rawDb.exec('COMMIT;');
        return res;
      } catch (err) {
        try {
          rawDb.exec('ROLLBACK;');
        } catch {
          // ignore
        }
        throw err;
      }
    },
    async close() {
      rawDb.close();
    },
  };
  return { driver, rawDb };
}

describe('Brain Sculpting Camp — 100% Offline Android Data & API Layer', () => {
  beforeEach(async () => {
    const { driver } = createNodeSqliteDriver();
    await initializeSchemaAndDefaults(driver);
    setCustomSqlDriver(driver);
  });

  it('1. initializes default settings & supports onboarding update', async () => {
    const initial = await api.get<{ settings: any }>('/api/system/settings');
    expect(initial.settings.profile_name).toBe('Learner');
    expect(initial.settings.onboarding_completed).toBe(0);

    const updated = await api.put<{ settings: any }>('/api/system/settings', {
      profile_name: 'Mostafa',
      theme: 'dark',
      onboarding_completed: 1,
    });
    expect(updated.settings.profile_name).toBe('Mostafa');
    expect(updated.settings.theme).toBe('dark');
    expect(updated.settings.onboarding_completed).toBe(1);
  });

  it('2. enforces task dependencies, recurring spawns, and habit streaks', async () => {
    const t1 = await api.post<{ task: any }>('/api/tasks', {
      title: 'Step 1: Read Spec',
      priority: 'high',
      due_date: '2026-11-13',
    });
    const t2 = await api.post<{ task: any }>('/api/tasks', {
      title: 'Step 2: Build APK',
      priority: 'urgent',
      due_date: '2026-11-13',
      recurrence_rule: 'daily',
      prerequisite_ids: [t1.task.id],
    });

    // Cannot complete t2 while t1 is incomplete
    await expect(api.put(`/api/tasks/${t2.task.id}`, { status: 'completed' })).rejects.toBeInstanceOf(LocalHttpError);

    // Complete t1 first, then t2
    await api.put(`/api/tasks/${t1.task.id}`, { status: 'completed' });
    const done2 = await api.put<{ task: any }>(`/api/tasks/${t2.task.id}`, { status: 'completed' });
    expect(done2.task.status).toBe('completed');

    // Verify daily recurring instance spawned
    const list = await api.get<{ tasks: any[] }>('/api/tasks');
    const spawned = list.tasks.filter((t) => t.title === 'Step 2: Build APK' && t.status === 'todo');
    expect(spawned.length).toBe(1);

    // Habit creation + log + streak
    const h = await api.post<{ habit: any }>('/api/tasks/habits', {
      title: 'Morning Walk',
      frequency: 'daily',
      target_value: 1,
    });
    const today = new Date().toISOString().slice(0, 10);
    await api.post(`/api/tasks/habits/${h.habit.id}/log`, { log_date: today, completed: true });

    const afterHabit = await api.get<{ habits: any[] }>('/api/tasks/habits/all');
    const savedHabit = afterHabit.habits.find((x) => x.id === h.habit.id);
    expect(savedHabit.todayLog?.completed).toBe(1);
    expect(savedHabit.streak).toBe(1);
  });

  it('3. maintains NOW queue exclusivity & logs reading sessions', async () => {
    const b1 = await api.post<{ book: any; queueDemotedFromNow: boolean }>('/api/books', {
      title: 'Designing Data-Intensive Applications',
      author: 'Martin Kleppmann',
      queue_bucket: 'NOW',
      total_pages: 600,
    });
    expect(b1.book.queue_bucket).toBe('NOW');
    expect(b1.queueDemotedFromNow).toBe(false);

    const b2 = await api.post<{ book: any; queueDemotedFromNow: boolean }>('/api/books', {
      title: 'Deep Work',
      author: 'Cal Newport',
      queue_bucket: 'NOW',
      total_pages: 300,
    });
    expect(b2.queueDemotedFromNow).toBe(true);
    expect(b2.book.queue_bucket).toBe('NEXT');

    await api.post(`/api/books/${b1.book.id}/sessions`, {
      duration_minutes: 30,
      start_page: 0,
      end_page: 25,
      notes: 'Chapter 1 storage engines',
    });

    const detail = await api.get<{ book: any; sessions: any[] }>(`/api/books/${b1.book.id}`);
    expect(detail.book.current_page).toBe(25);
    expect(detail.sessions.length).toBe(1);
  });

  it('4. schedules SM-2 spaced repetition in Study & English and runs Offline Coach', async () => {
    const course = await api.post<{ course: any }>('/api/study/courses', {
      title: 'Android Local-First Architecture',
      planned_hours: 10,
    });
    const mod = await api.post<{ module: any }>('/api/study/modules', {
      course_id: course.course.id,
      title: 'SQLite Foundations',
    });
    const topic = await api.post<{ topic: any }>('/api/study/topics', {
      module_id: mod.module.id,
      course_id: course.course.id,
      title: 'Transactions & Foreign Keys',
      topic_kind: 'lesson',
    });

    const rev = await api.post<{ topic: any }>(`/api/study/topics/${topic.topic.id}/review`, { quality: 5 });
    expect(rev.topic.revision_count).toBe(1);
    expect(rev.topic.next_review_date).toBeTruthy();

    const vocab = await api.post<{ item: any }>('/api/english/vocabulary', {
      word: 'resilient',
      meaning: 'able to recover quickly from difficulties',
      part_of_speech: 'adjective',
      example: 'Offline apps stay resilient without connectivity.',
    });
    const vRev = await api.post<{ item: any }>(`/api/english/vocabulary/${vocab.item.id}/review`, { quality: 4 });
    expect(vRev.item.interval_days).toBeGreaterThanOrEqual(1);

    const chat = await api.post<{ reply: any }>('/api/ai/tutor/chat', {
      mode: 'tech_interview',
      message: 'We use SQLite transactions so offline writes never corrupt user state.',
      level: 'B2',
    });
    expect(chat.reply.role).toBe('assistant');
    expect(chat.reply.content.length).toBeGreaterThan(20);
  });

  it('5. rolls up goal progress from linked tasks and tracks persistent timers', async () => {
    const goal = await api.post<{ goal: any }>('/api/goals', {
      title: 'Ship Personal Knowledge Hub APK',
      category: 'Career',
      timeframe_type: 'quarterly',
      target_date: '2026-12-31',
    });

    const task = await api.post<{ task: any }>('/api/tasks', {
      title: 'Verify unit test suite',
    });

    await api.post(`/api/goals/${goal.goal.id}/links`, {
      entity_type: 'task',
      entity_id: task.task.id,
      entity_title: task.task.title,
    });

    // Start, pause, resume, stop timer on task
    const started = await api.post<{ timer: any }>('/api/system/timers/start', {
      entity_type: 'task',
      entity_id: task.task.id,
      entity_title: task.task.title,
    });
    await api.post(`/api/system/timers/${started.timer.id}/pause`);
    await api.post(`/api/system/timers/${started.timer.id}/resume`);
    const stopped = await api.post<{ ok: boolean; durationSeconds: number }>(`/api/system/timers/${started.timer.id}/stop`, {
      notes: 'All checks passed',
    });
    expect(stopped.ok).toBe(true);

    // Complete linked task -> Goal reaches 100%
    await api.put(`/api/tasks/${task.task.id}`, { status: 'completed' });
    const goalsRes = await api.get<{ goals: any[] }>('/api/goals');
    const updatedGoal = goalsRes.goals.find((g) => g.id === goal.goal.id);
    expect(updatedGoal.progress).toBe(100);
  });

  it('6. supports sample data load/clear without deleting user data & full JSON export/import roundtrip', async () => {
    await api.put('/api/system/settings', {
      profile_name: 'Mostafa',
      theme: 'dark',
      onboarding_completed: 1,
    });
    const myBook = await api.post<{ book: any }>('/api/books', {
      title: 'My Custom User Book',
      author: 'User Author',
      queue_bucket: 'NOW',
    });

    // Load sample data and verify mixed state
    await api.post('/api/system/sample-data/load');
    const withSample = await api.get<{ books: any[] }>('/api/books');
    expect(withSample.books.length).toBeGreaterThan(1);

    // Clear sample data only
    await api.post('/api/system/sample-data/clear');
    const afterClear = await api.get<{ books: any[] }>('/api/books');
    expect(afterClear.books.map((b) => b.id)).toEqual([myBook.book.id]);

    // Export full JSON backup
    const exportedPayload = await buildFullJsonExport();
    expect(exportedPayload.app).toBe('Brain Sculpting Camp');
    expect(exportedPayload.platform).toBe('android-offline');
    expect(exportedPayload.data.books.length).toBe(1);

    // Simulate brand new fresh device database
    const { driver: freshDeviceDriver } = createNodeSqliteDriver();
    await initializeSchemaAndDefaults(freshDeviceDriver);
    setCustomSqlDriver(freshDeviceDriver);

    // Verify fresh device starts empty
    const emptyCheck = await api.get<{ books: any[] }>('/api/books');
    expect(emptyCheck.books.length).toBe(0);

    // Import exported JSON backup onto fresh device
    const importRes = await importFullJsonBackup(exportedPayload);
    expect(importRes.ok).toBe(true);
    expect(importRes.restoredRows).toBeGreaterThan(0);

    // Verify user data & settings restored identically
    const restoredSettings = await api.get<{ settings: any }>('/api/system/settings');
    expect(restoredSettings.settings.profile_name).toBe('Mostafa');
    expect(restoredSettings.settings.theme).toBe('dark');
    const restoredBooks = await api.get<{ books: any[] }>('/api/books');
    expect(restoredBooks.books.length).toBe(1);
    expect(restoredBooks.books[0].title).toBe('My Custom User Book');
  });
});
