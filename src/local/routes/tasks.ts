import { getLocalDb } from '../sqliteDriver.ts';
import { uid } from '../schema.ts';
import { LocalHttpError } from '../httpError.ts';
import { findBlockedTasks, findOverdueTasks, getNextRecurrenceDate } from '../../shared/logic.ts';
import type { Task, TaskDependency } from '../../shared/types.ts';

export async function listTasks() {
  const db = await getLocalDb();
  const tasks = (await db.all('SELECT * FROM tasks ORDER BY created_at DESC')) as unknown as Task[];
  const dependencies = (await db.all('SELECT * FROM task_dependencies')) as unknown as TaskDependency[];
  const sessions = await db.all('SELECT * FROM task_sessions ORDER BY started_at DESC');
  const blockedMap = findBlockedTasks(tasks, dependencies);
  const today = new Date().toISOString().slice(0, 10);
  const overdueIds = new Set(findOverdueTasks(tasks, today).map((t) => t.id));

  const enriched = tasks.map((t) => ({
    ...t,
    blockedBy: blockedMap.get(t.id) ?? [],
    isOverdue: overdueIds.has(t.id),
  }));

  return { tasks: enriched, dependencies, sessions };
}

export async function createTask(body: any) {
  const db = await getLocalDb();
  const {
    title,
    description = '',
    task_type = 'one_time',
    parent_task_id = null,
    project_id = null,
    priority = 'medium',
    status = 'todo',
    mandatory = 1,
    category = 'General',
    tags = [],
    due_date = null,
    scheduled_start = null,
    scheduled_end = null,
    reminder_at = null,
    recurrence_rule = null,
    estimated_minutes = null,
    prerequisite_ids = [],
  } = body ?? {};

  if (!title || !String(title).trim()) throw new LocalHttpError(400, 'Task title is required.');

  const now = new Date().toISOString();
  const id = uid('task');
  await db.run(
    `INSERT INTO tasks (
      id, title, description, task_type, parent_task_id, project_id, priority, status,
      mandatory, category, tags_json, due_date, scheduled_start, scheduled_end,
      reminder_at, recurrence_rule, estimated_minutes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      String(title).trim(),
      String(description),
      task_type,
      parent_task_id || null,
      project_id || null,
      priority,
      status,
      mandatory ? 1 : 0,
      String(category).trim() || 'General',
      JSON.stringify(Array.isArray(tags) ? tags : []),
      due_date || null,
      scheduled_start || null,
      scheduled_end || null,
      reminder_at || null,
      recurrence_rule || null,
      estimated_minutes ? Number(estimated_minutes) : null,
      now,
      now,
    ]
  );

  if (Array.isArray(prerequisite_ids)) {
    for (const preId of prerequisite_ids) {
      if (preId && preId !== id) {
        await db.run('INSERT OR IGNORE INTO task_dependencies (id, task_id, prerequisite_task_id) VALUES (?, ?, ?)', [
          uid('dep'),
          id,
          String(preId),
        ]);
      }
    }
  }

  return { task: await db.get('SELECT * FROM tasks WHERE id = ?', [id]) };
}

export async function updateTask(id: string, body: any) {
  const db = await getLocalDb();
  const existing = (await db.get('SELECT * FROM tasks WHERE id = ?', [id])) as unknown as Task | undefined;
  if (!existing) throw new LocalHttpError(404, 'Task not found');

  const b = body ?? {};
  const nextStatus = b.status ?? existing.status;

  if (nextStatus === 'in_progress' || nextStatus === 'completed') {
    const allTasks = (await db.all('SELECT * FROM tasks')) as unknown as Task[];
    const allDeps = (await db.all('SELECT * FROM task_dependencies')) as unknown as TaskDependency[];
    const blocked = findBlockedTasks(allTasks, allDeps).get(id);
    if (blocked && blocked.length > 0) {
      throw new LocalHttpError(
        409,
        `Cannot start or complete this task until prerequisite(s) are completed: ${blocked.join(', ')}`
      );
    }
  }

  const now = new Date().toISOString();
  const completedAt =
    nextStatus === 'completed' ? existing.completed_at ?? now : nextStatus === 'todo' ? null : existing.completed_at;

  await db.run(
    `UPDATE tasks SET
      title = ?, description = ?, task_type = ?, project_id = ?, priority = ?, status = ?,
      mandatory = ?, category = ?, tags_json = ?, due_date = ?, scheduled_start = ?, scheduled_end = ?,
      reminder_at = ?, recurrence_rule = ?, estimated_minutes = ?, completed_at = ?, updated_at = ?
    WHERE id = ?`,
    [
      b.title !== undefined ? String(b.title).trim() : existing.title,
      b.description !== undefined ? String(b.description) : existing.description,
      b.task_type ?? existing.task_type,
      b.project_id !== undefined ? b.project_id || null : existing.project_id,
      b.priority ?? existing.priority,
      nextStatus,
      b.mandatory !== undefined ? (b.mandatory ? 1 : 0) : existing.mandatory,
      b.category !== undefined ? String(b.category) : existing.category,
      b.tags !== undefined ? JSON.stringify(b.tags) : existing.tags_json,
      b.due_date !== undefined ? b.due_date || null : existing.due_date,
      b.scheduled_start !== undefined ? b.scheduled_start || null : existing.scheduled_start,
      b.scheduled_end !== undefined ? b.scheduled_end || null : existing.scheduled_end,
      b.reminder_at !== undefined ? b.reminder_at || null : existing.reminder_at,
      b.recurrence_rule !== undefined ? b.recurrence_rule || null : existing.recurrence_rule,
      b.estimated_minutes !== undefined
        ? b.estimated_minutes
          ? Number(b.estimated_minutes)
          : null
        : existing.estimated_minutes,
      completedAt,
      now,
      id,
    ]
  );

  let nextOccurrence: unknown = null;
  if (existing.status !== 'completed' && nextStatus === 'completed' && (b.recurrence_rule || existing.recurrence_rule)) {
    const rule = b.recurrence_rule || existing.recurrence_rule!;
    const baseDate = existing.due_date || now.slice(0, 10);
    const nextDue = getNextRecurrenceDate(baseDate, rule);
    const nextId = uid('task');
    await db.run(
      `INSERT INTO tasks (
        id, title, description, task_type, project_id, priority, status, mandatory, category,
        tags_json, due_date, scheduled_start, scheduled_end, recurrence_rule, estimated_minutes, created_at, updated_at
      ) VALUES (?, ?, ?, 'recurring', ?, ?, 'todo', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nextId,
        existing.title,
        existing.description,
        existing.project_id,
        existing.priority,
        existing.mandatory,
        existing.category,
        existing.tags_json,
        nextDue,
        existing.scheduled_start,
        existing.scheduled_end,
        rule,
        existing.estimated_minutes,
        now,
        now,
      ]
    );
    nextOccurrence = await db.get('SELECT * FROM tasks WHERE id = ?', [nextId]);
  }

  if (Array.isArray(b.prerequisite_ids)) {
    await db.run('DELETE FROM task_dependencies WHERE task_id = ?', [id]);
    for (const preId of b.prerequisite_ids) {
      if (preId && preId !== id) {
        await db.run('INSERT OR IGNORE INTO task_dependencies (id, task_id, prerequisite_task_id) VALUES (?, ?, ?)', [
          uid('dep'),
          id,
          String(preId),
        ]);
      }
    }
  }

  return { task: await db.get('SELECT * FROM tasks WHERE id = ?', [id]), nextOccurrence };
}

export async function taskOverdueAction(id: string, body: any) {
  const db = await getLocalDb();
  const { action, new_date } = body ?? {};
  const existing = await db.get('SELECT * FROM tasks WHERE id = ?', [id]);
  if (!existing) throw new LocalHttpError(404, 'Task not found');

  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();

  if (action === 'carry_forward') {
    await db.run('UPDATE tasks SET due_date = ?, updated_at = ? WHERE id = ?', [today, now, id]);
  } else if (action === 'reschedule') {
    if (!new_date) throw new LocalHttpError(400, 'new_date is required to reschedule.');
    await db.run('UPDATE tasks SET due_date = ?, updated_at = ? WHERE id = ?', [String(new_date), now, id]);
  } else if (action === 'skip') {
    await db.run("UPDATE tasks SET status = 'cancelled', updated_at = ? WHERE id = ?", [now, id]);
  } else {
    throw new LocalHttpError(400, 'Invalid overdue action.');
  }

  return { task: await db.get('SELECT * FROM tasks WHERE id = ?', [id]) };
}

export async function deleteTask(id: string) {
  await (await getLocalDb()).run('DELETE FROM tasks WHERE id = ?', [id]);
  return { ok: true };
}

export async function listHabits() {
  const db = await getLocalDb();
  const habits = await db.all<Record<string, any>>('SELECT * FROM habits WHERE archived = 0 ORDER BY created_at ASC');
  const logs = await db.all<Record<string, any>>('SELECT * FROM habit_logs ORDER BY log_date DESC');
  const today = new Date().toISOString().slice(0, 10);

  const enriched = habits.map((h) => {
    const hLogs = logs.filter((l) => l.habit_id === h.id);
    const todayLog = hLogs.find((l) => l.log_date === today) ?? null;
    const completedDates = new Set(hLogs.filter((l) => l.completed === 1).map((l) => l.log_date));
    let streak = 0;
    const cursor = new Date();
    for (let i = 0; i < 365; i++) {
      const dStr = cursor.toISOString().slice(0, 10);
      if (completedDates.has(dStr)) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
      } else if (i === 0) {
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }
    return { ...h, todayLog, streak, recentLogs: hLogs.slice(0, 30) };
  });

  return { habits: enriched };
}

export async function createHabit(body: any) {
  const db = await getLocalDb();
  const {
    title,
    description = '',
    frequency = 'daily',
    tracking_type = 'checkbox',
    target_value = 1,
    unit = 'times',
    mandatory = 0,
    category = 'Health',
  } = body ?? {};
  if (!title || !String(title).trim()) throw new LocalHttpError(400, 'Habit title is required.');
  const id = uid('hab');
  await db.run(
    `INSERT INTO habits (id, title, description, frequency, tracking_type, target_value, unit, mandatory, category, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      String(title).trim(),
      String(description),
      frequency,
      tracking_type,
      Math.max(1, Number(target_value || 1)),
      String(unit || 'times'),
      mandatory ? 1 : 0,
      String(category || 'Health'),
      new Date().toISOString(),
    ]
  );
  return { habit: await db.get('SELECT * FROM habits WHERE id = ?', [id]) };
}

export async function logHabit(id: string, body: any) {
  const db = await getLocalDb();
  const habit = await db.get<Record<string, any>>('SELECT * FROM habits WHERE id = ?', [id]);
  if (!habit) throw new LocalHttpError(404, 'Habit not found');
  const { log_date = new Date().toISOString().slice(0, 10), value, completed, notes = '' } = body ?? {};
  const numericVal = value !== undefined ? Number(value) : completed ? Number(habit.target_value) : 0;
  const isCompleted =
    completed !== undefined ? (completed ? 1 : 0) : numericVal >= Number(habit.target_value) ? 1 : 0;
  const now = new Date().toISOString();

  const existing = await db.get<{ id: string }>('SELECT id FROM habit_logs WHERE habit_id = ? AND log_date = ?', [
    id,
    log_date,
  ]);
  if (existing) {
    await db.run('UPDATE habit_logs SET value = ?, completed = ?, notes = ? WHERE id = ?', [
      numericVal,
      isCompleted,
      String(notes),
      existing.id,
    ]);
  } else {
    await db.run(
      'INSERT INTO habit_logs (id, habit_id, log_date, value, completed, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uid('hl'), id, log_date, numericVal, isCompleted, String(notes), now]
    );
  }
  return { ok: true };
}

export async function deleteHabit(id: string) {
  await (await getLocalDb()).run('DELETE FROM habits WHERE id = ?', [id]);
  return { ok: true };
}
