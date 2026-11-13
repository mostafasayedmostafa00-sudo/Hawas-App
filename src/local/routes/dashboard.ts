import { getLocalDb } from '../sqliteDriver.ts';
import { uid } from '../schema.ts';
import { LocalHttpError } from '../httpError.ts';
import {
  calculateDailyScore,
  computeNowNext,
  findBlockedTasks,
  findOverdueTasks,
  parseScoreWeights,
  type ScoreItemInput,
} from '../../shared/logic.ts';
import type { NowNextCandidate, Task, TaskDependency } from '../../shared/types.ts';

export async function getDashboard(query: URLSearchParams) {
  const db = await getLocalDb();
  const today = query.get('date') || new Date().toISOString().slice(0, 10);
  const nowTime = new Date().toTimeString().slice(0, 5);
  const dayOfWeek = new Date(`${today}T12:00:00Z`).getUTCDay();

  const settings = await db.get<Record<string, any>>('SELECT * FROM user_settings WHERE id = 1');
  const weights = parseScoreWeights(settings?.score_weights_json);

  const allTasks = (await db.all('SELECT * FROM tasks')) as unknown as Task[];
  const allDeps = (await db.all('SELECT * FROM task_dependencies')) as unknown as TaskDependency[];
  const blockedMap = findBlockedTasks(allTasks, allDeps);
  const overdueTasks = findOverdueTasks(allTasks, today);

  const todaysTasks = allTasks.filter(
    (t) =>
      t.parent_task_id === null &&
      t.task_type !== 'project' &&
      (t.due_date === today || (t.due_date === null && t.status === 'in_progress'))
  );

  const habits = await db.all<Record<string, any>>('SELECT * FROM habits WHERE archived = 0');
  const habitLogsToday = await db.all<Record<string, any>>('SELECT * FROM habit_logs WHERE log_date = ?', [today]);
  const habitLogMap = new Map(habitLogsToday.map((l) => [l.habit_id, l]));

  const templateBlocks = await db.all<Record<string, any>>(
    'SELECT * FROM weekly_template_blocks WHERE day_of_week = ? ORDER BY start_time ASC',
    [dayOfWeek]
  );
  const exceptions = await db.all<Record<string, any>>(
    'SELECT * FROM daily_schedule_exceptions WHERE exception_date = ?',
    [today]
  );

  const nowNextRow = await db.get<Record<string, any>>('SELECT * FROM daily_now_next_state WHERE state_date = ?', [
    today,
  ]);
  const manualNowId: string | null = nowNextRow?.manual_now_id ?? null;
  const nextOrderIds: string[] = nowNextRow ? JSON.parse(nowNextRow.next_order_json || '[]') : [];
  const skippedIds: string[] = nowNextRow ? JSON.parse(nowNextRow.skipped_ids_json || '[]') : [];
  const completedBlockIds = new Set<string>(nowNextRow ? JSON.parse(nowNextRow.completed_blocks_json || '[]') : []);

  const skipBlockIds = new Set(exceptions.filter((e) => e.action === 'skip').map((e) => e.template_block_id));
  const overrideMap = new Map(
    exceptions.filter((e) => e.action === 'override' && e.template_block_id).map((e) => [e.template_block_id, e])
  );

  const todayBlocks: Array<Record<string, any>> = [];
  for (const blk of templateBlocks) {
    if (skipBlockIds.has(blk.id)) continue;
    const ov = overrideMap.get(blk.id);
    todayBlocks.push({
      id: blk.id,
      title: ov?.title ?? blk.title,
      start_time: ov?.start_time ?? blk.start_time,
      end_time: ov?.end_time ?? blk.end_time,
      module: ov?.module ?? blk.module,
      mandatory: ov?.mandatory ?? blk.mandatory,
      completed: completedBlockIds.has(blk.id),
      isException: Boolean(ov),
    });
  }
  for (const ex of exceptions.filter((e) => e.action === 'add')) {
    todayBlocks.push({
      id: ex.id,
      title: ex.title ?? 'Custom Block',
      start_time: ex.start_time ?? '12:00',
      end_time: ex.end_time ?? '13:00',
      module: ex.module ?? 'general',
      mandatory: ex.mandatory ?? 0,
      completed: completedBlockIds.has(ex.id),
      isException: true,
    });
  }
  todayBlocks.sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));

  const readingNow = await db.get<Record<string, any>>(
    "SELECT * FROM books WHERE queue_bucket = 'NOW' ORDER BY queue_order ASC LIMIT 1"
  );
  const readingTodaySessions = await db.all<Record<string, any>>(
    'SELECT * FROM reading_sessions WHERE substr(started_at, 1, 10) = ?',
    [today]
  );

  const dueTopics = await db.all<Record<string, any>>(
    "SELECT * FROM study_topics WHERE next_review_date <= ? AND status != 'completed' LIMIT 5",
    [today]
  );
  const englishPlan = await db.all<Record<string, any>>('SELECT * FROM english_daily_plan');
  const workoutToday = await db.all<Record<string, any>>('SELECT * FROM workout_sessions WHERE session_date = ?', [
    today,
  ]);

  const candidates: NowNextCandidate[] = [];
  for (const t of todaysTasks) {
    if (t.status === 'completed' || t.status === 'cancelled') continue;
    const blockedBy = blockedMap.get(t.id) ?? [];
    const pMap: Record<string, number> = { urgent: 100, high: 80, medium: 55, low: 30 };
    candidates.push({
      id: `task:${t.id}`,
      sourceType: 'task',
      sourceId: t.id,
      title: t.title,
      subtitle: `${t.category} · ${t.priority} priority${t.scheduled_start ? ` · ${t.scheduled_start}` : ''}`,
      category: 'tasks',
      mandatory: t.mandatory === 1,
      priorityScore: pMap[t.priority] ?? 50,
      scheduledStart: t.scheduled_start,
      scheduledEnd: t.scheduled_end,
      blocked: blockedBy.length > 0,
      blockedReason: blockedBy.length > 0 ? `Waiting on: ${blockedBy.join(', ')}` : undefined,
    });
  }

  for (const b of todayBlocks) {
    if (b.completed) continue;
    candidates.push({
      id: `block:${b.id}`,
      sourceType: 'schedule',
      sourceId: b.id,
      title: b.title,
      subtitle: `Scheduled ${b.start_time}–${b.end_time} · ${b.module}`,
      category: (b.module as any) || 'general',
      mandatory: b.mandatory === 1,
      priorityScore: 75,
      scheduledStart: b.start_time,
      scheduledEnd: b.end_time,
      blocked: false,
    });
  }

  if (readingNow && readingTodaySessions.length === 0) {
    candidates.push({
      id: `book:${readingNow.id}`,
      sourceType: 'book',
      sourceId: readingNow.id,
      title: `Read: ${readingNow.title}`,
      subtitle: `Page ${readingNow.current_page}${readingNow.total_pages ? ` / ${readingNow.total_pages}` : ''}`,
      category: 'reading',
      mandatory: false,
      priorityScore: 52,
      blocked: false,
    });
  }

  for (const top of dueTopics) {
    candidates.push({
      id: `study:${top.id}`,
      sourceType: 'study',
      sourceId: top.id,
      title: `Review: ${top.title}`,
      subtitle: `Spaced repetition due`,
      category: 'study',
      mandatory: false,
      priorityScore: 60,
      blocked: false,
    });
  }

  for (const ep of englishPlan) {
    if (ep.last_completed_date === today) continue;
    candidates.push({
      id: `english:${ep.id}`,
      sourceType: 'english',
      sourceId: ep.id,
      title: ep.title,
      subtitle: `English (${ep.skill}) · ${ep.target_minutes} min`,
      category: 'english',
      mandatory: false,
      priorityScore: 48,
      blocked: false,
    });
  }

  const nowNext = computeNowNext({
    candidates,
    currentTimeHHMM: nowTime,
    manualNowId,
    nextOrderIds,
    skippedIds,
  });

  const skippedSet = new Set(skippedIds);
  const scoreItems: ScoreItemInput[] = [];

  for (const t of todaysTasks) {
    const cid = `task:${t.id}`;
    const status =
      t.status === 'completed'
        ? 'completed'
        : t.status === 'cancelled' || skippedSet.has(cid)
          ? 'skipped'
          : 'pending';
    scoreItems.push({ id: cid, title: t.title, category: 'tasks', mandatory: t.mandatory === 1, status });
  }

  for (const h of habits) {
    const log = habitLogMap.get(h.id);
    const cid = `habit:${h.id}`;
    scoreItems.push({
      id: cid,
      title: h.title,
      category: 'habits',
      mandatory: h.mandatory === 1,
      status: log?.completed === 1 ? 'completed' : skippedSet.has(cid) ? 'skipped' : 'pending',
    });
  }

  if (readingNow) {
    const cid = `book:${readingNow.id}`;
    scoreItems.push({
      id: cid,
      title: `Reading: ${readingNow.title}`,
      category: 'reading',
      mandatory: false,
      status: readingTodaySessions.length > 0 ? 'completed' : skippedSet.has(cid) ? 'skipped' : 'pending',
    });
  }

  for (const ep of englishPlan) {
    const cid = `english:${ep.id}`;
    scoreItems.push({
      id: cid,
      title: ep.title,
      category: 'english',
      mandatory: false,
      status: ep.last_completed_date === today ? 'completed' : skippedSet.has(cid) ? 'skipped' : 'pending',
    });
  }

  if (workoutToday.length > 0) {
    scoreItems.push({
      id: 'workout:today',
      title: workoutToday[0].title,
      category: 'workout',
      mandatory: false,
      status: 'completed',
    });
  }

  const dailyScore = calculateDailyScore(scoreItems, weights);
  const activeTimers = await db.all('SELECT * FROM active_timers');
  const dueReminders = allTasks.filter(
    (t) => t.reminder_at && t.status !== 'completed' && t.status !== 'cancelled' && t.reminder_at.slice(0, 10) <= today
  );

  return {
    date: today,
    nowTime,
    settings,
    dailyScore,
    nowNext,
    todaysTasks,
    overdueTasks,
    habits: habits.map((h) => ({ ...h, todayLog: habitLogMap.get(h.id) ?? null })),
    todayBlocks,
    readingNow: readingNow ?? null,
    readingMinutesToday: Math.round(
      readingTodaySessions.reduce((s, x) => s + Number(x.duration_seconds || 0), 0) / 60
    ),
    dueTopics,
    englishPlan: englishPlan.map((p) => ({ ...p, completed_today: p.last_completed_date === today ? 1 : 0 })),
    workoutToday,
    activeTimers,
    dueReminders,
  };
}

export async function postNowNext(body: any) {
  const db = await getLocalDb();
  const { date = new Date().toISOString().slice(0, 10), action, candidateId, nextOrderIds } = body ?? {};
  const existing = await db.get<Record<string, any>>(
    'SELECT * FROM daily_now_next_state WHERE state_date = ?',
    [date]
  );

  let manualNowId: string | null = existing?.manual_now_id ?? null;
  let nextOrder: string[] = existing ? JSON.parse(existing.next_order_json || '[]') : [];
  let skippedIds: string[] = existing ? JSON.parse(existing.skipped_ids_json || '[]') : [];
  let completedBlocks: string[] = existing ? JSON.parse(existing.completed_blocks_json || '[]') : [];

  if (action === 'set_now' && candidateId) {
    manualNowId = candidateId;
    skippedIds = skippedIds.filter((id) => id !== candidateId);
  } else if (action === 'reorder_next' && Array.isArray(nextOrderIds)) {
    nextOrder = nextOrderIds;
  } else if (action === 'skip' && candidateId) {
    if (!skippedIds.includes(candidateId)) skippedIds.push(candidateId);
    if (manualNowId === candidateId) manualNowId = null;
  } else if (action === 'unskip' && candidateId) {
    skippedIds = skippedIds.filter((id) => id !== candidateId);
  } else if (action === 'complete_block' && candidateId) {
    const blockId = String(candidateId).replace(/^block:/, '');
    if (!completedBlocks.includes(blockId)) completedBlocks.push(blockId);
    if (manualNowId === candidateId) manualNowId = null;
  } else if (action === 'clear_manual_now') {
    manualNowId = null;
  }

  const now = new Date().toISOString();
  if (existing) {
    await db.run(
      'UPDATE daily_now_next_state SET manual_now_id = ?, next_order_json = ?, skipped_ids_json = ?, completed_blocks_json = ?, updated_at = ? WHERE state_date = ?',
      [manualNowId, JSON.stringify(nextOrder), JSON.stringify(skippedIds), JSON.stringify(completedBlocks), now, date]
    );
  } else {
    await db.run(
      'INSERT INTO daily_now_next_state (state_date, manual_now_id, next_order_json, skipped_ids_json, completed_blocks_json, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [date, manualNowId, JSON.stringify(nextOrder), JSON.stringify(skippedIds), JSON.stringify(completedBlocks), now]
    );
  }

  return { ok: true };
}

export async function getWeeklyBlocks() {
  const db = await getLocalDb();
  const blocks = await db.all('SELECT * FROM weekly_template_blocks ORDER BY day_of_week ASC, start_time ASC');
  return { blocks };
}

export async function createWeeklyBlock(body: any) {
  const db = await getLocalDb();
  const { day_of_week, start_time, end_time, title, module = 'general', mandatory = 1 } = body ?? {};
  if (day_of_week === undefined || !start_time || !end_time || !title) {
    throw new LocalHttpError(400, 'day_of_week, start_time, end_time, and title are required.');
  }
  const id = uid('blk');
  await db.run(
    'INSERT INTO weekly_template_blocks (id, day_of_week, start_time, end_time, title, module, mandatory) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, Number(day_of_week), start_time, end_time, String(title).trim(), module, mandatory ? 1 : 0]
  );
  return { block: await db.get('SELECT * FROM weekly_template_blocks WHERE id = ?', [id]) };
}

export async function deleteWeeklyBlock(id: string) {
  const db = await getLocalDb();
  await db.run('DELETE FROM weekly_template_blocks WHERE id = ?', [id]);
  return { ok: true };
}

export async function createException(body: any) {
  const db = await getLocalDb();
  const {
    exception_date,
    template_block_id = null,
    action = 'add',
    title = null,
    start_time = null,
    end_time = null,
    module = 'general',
    mandatory = 0,
  } = body ?? {};
  const id = uid('exc');
  await db.run(
    'INSERT INTO daily_schedule_exceptions (id, exception_date, template_block_id, action, title, start_time, end_time, module, mandatory) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, exception_date, template_block_id, action, title, start_time, end_time, module, mandatory ? 1 : 0]
  );
  return { id };
}

export async function globalSearch(query: URLSearchParams) {
  const q = (query.get('q') || '').trim().toLowerCase();
  if (!q) return { results: [] };

  const db = await getLocalDb();
  const like = `%${q}%`;

  const books = await db.all<any>(
    'SELECT id, title, author FROM books WHERE lower(title) LIKE ? OR lower(author) LIKE ? LIMIT 8',
    [like, like]
  );
  const tasks = await db.all<any>(
    'SELECT id, title, status, priority FROM tasks WHERE lower(title) LIKE ? OR lower(description) LIKE ? LIMIT 10',
    [like, like]
  );
  const courses = await db.all<any>('SELECT id, title, provider FROM courses WHERE lower(title) LIKE ? LIMIT 8', [like]);
  const topics = await db.all<any>('SELECT id, title, status FROM study_topics WHERE lower(title) LIKE ? LIMIT 8', [like]);
  const notes = await db.all<any>(
    'SELECT id, topic_id, title FROM topic_notes WHERE lower(title) LIKE ? OR lower(content) LIKE ? LIMIT 8',
    [like, like]
  );
  const vocab = await db.all<any>(
    'SELECT id, word, meaning FROM vocabulary_items WHERE lower(word) LIKE ? OR lower(meaning) LIKE ? LIMIT 8',
    [like, like]
  );
  const goals = await db.all<any>(
    'SELECT id, title, area FROM goals WHERE lower(title) LIKE ? OR lower(description) LIKE ? LIMIT 8',
    [like, like]
  );

  const results = [
    ...books.map((x) => ({ type: 'book', section: 'books', id: x.id, title: x.title, subtitle: `Book · ${x.author || 'Unknown author'}` })),
    ...tasks.map((x) => ({ type: 'task', section: 'tasks', id: x.id, title: x.title, subtitle: `Task · ${x.status} · ${x.priority}` })),
    ...courses.map((x) => ({ type: 'course', section: 'study', id: x.id, title: x.title, subtitle: `Course · ${x.provider || 'Self-study'}` })),
    ...topics.map((x) => ({ type: 'topic', section: 'study', id: x.id, title: x.title, subtitle: `Study Topic · ${x.status}` })),
    ...notes.map((x) => ({ type: 'note', section: 'study', id: x.id, title: x.title, subtitle: `Study Note` })),
    ...vocab.map((x) => ({ type: 'vocabulary', section: 'english', id: x.id, title: x.word, subtitle: `Vocabulary · ${x.meaning}` })),
    ...goals.map((x) => ({ type: 'goal', section: 'goals', id: x.id, title: x.title, subtitle: `Goal · ${x.area}` })),
  ];

  return { results };
}

export async function getCalendarEvents(query: URLSearchParams) {
  const db = await getLocalDb();
  const tasks = await db.all<any>('SELECT id, title, due_date, status, priority, scheduled_start FROM tasks WHERE due_date IS NOT NULL');
  const books = await db.all<any>('SELECT id, title, target_finish_date FROM books WHERE target_finish_date IS NOT NULL');
  const topics = await db.all<any>('SELECT id, title, next_review_date FROM study_topics WHERE next_review_date IS NOT NULL');
  const goals = await db.all<any>("SELECT id, title, target_date, area FROM goals WHERE status = 'active'");
  const workouts = await db.all<any>('SELECT id, title, session_date, duration_minutes FROM workout_sessions');

  const events = [
    ...tasks.map((t) => ({ id: `task_${t.id}`, date: t.due_date, title: t.title, module: 'tasks', meta: `${t.priority}${t.scheduled_start ? ` @ ${t.scheduled_start}` : ''}`, done: t.status === 'completed' })),
    ...books.map((b) => ({ id: `book_${b.id}`, date: b.target_finish_date, title: `Target finish: ${b.title}`, module: 'reading', meta: 'Book goal', done: false })),
    ...topics.map((t) => ({ id: `top_${t.id}`, date: t.next_review_date, title: `Review: ${t.title}`, module: 'study', meta: 'Spaced repetition', done: false })),
    ...goals.map((g) => ({ id: `goal_${g.id}`, date: g.target_date, title: `Goal target: ${g.title}`, module: 'goals', meta: g.area, done: false })),
    ...workouts.map((w) => ({ id: `wk_${w.id}`, date: w.session_date, title: w.title, module: 'workout', meta: `${w.duration_minutes} min`, done: true })),
  ];

  const start = query.get('start');
  const end = query.get('end');
  const filtered = events.filter((e) => (!start || e.date >= start) && (!end || e.date <= end));
  return { events: filtered };
}

export async function getAnalytics(query: URLSearchParams) {
  const db = await getLocalDb();
  const range = query.get('range') || '30d';
  const days = range === '7d' ? 7 : range === '90d' ? 90 : range === '365d' ? 365 : 30;
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);

  const tasks = await db.all<any>('SELECT status, estimated_minutes, due_date, completed_at FROM tasks WHERE parent_task_id IS NULL');
  const taskSessions = await db.all<any>('SELECT duration_seconds, started_at FROM task_sessions WHERE substr(started_at,1,10) >= ?', [sinceStr]);
  const habitLogs = await db.all<any>('SELECT log_date, completed FROM habit_logs WHERE log_date >= ?', [sinceStr]);
  const readingSessions = await db.all<any>('SELECT started_at, duration_seconds, pages_read FROM reading_sessions WHERE substr(started_at,1,10) >= ?', [sinceStr]);
  const studyTopics = await db.all<any>('SELECT study_seconds, planned_minutes, status FROM study_topics');
  const studySessions = await db.all<any>('SELECT started_at, duration_seconds FROM study_sessions WHERE substr(started_at,1,10) >= ?', [sinceStr]);
  const vocab = await db.all<any>('SELECT mastered, repetitions FROM vocabulary_items');
  const recordings = await db.all<any>('SELECT duration_seconds, created_at FROM speaking_recordings WHERE substr(created_at,1,10) >= ?', [sinceStr]);
  const workouts = await db.all<any>('SELECT session_date, duration_minutes FROM workout_sessions WHERE session_date >= ?', [sinceStr]);
  const goals = await db.all<any>('SELECT status FROM goals');

  const recentTasks = tasks.filter((t) => !t.due_date || t.due_date >= sinceStr);
  const completedTasks = recentTasks.filter((t) => t.status === 'completed').length;
  const taskCompletionRate = recentTasks.length > 0 ? Math.round((completedTasks / recentTasks.length) * 100) : null;

  const readingMinutes = Math.round(readingSessions.reduce((s, r) => s + Number(r.duration_seconds || 0), 0) / 60);
  const pagesRead = readingSessions.reduce((s, r) => s + Number(r.pages_read || 0), 0);

  const studyMinutes = Math.round(studySessions.reduce((s, x) => s + Number(x.duration_seconds || 0), 0) / 60);
  const totalTopicStudyMinutes = Math.round(studyTopics.reduce((s, t) => s + Number(t.study_seconds || 0), 0) / 60);
  const totalTopicPlannedMinutes = studyTopics.reduce((s, t) => s + Number(t.planned_minutes || 0), 0);

  const habitCompletedCount = habitLogs.filter((l) => l.completed === 1).length;
  const habitRate = habitLogs.length > 0 ? Math.round((habitCompletedCount / habitLogs.length) * 100) : null;

  const dailySeries: Array<{ date: string; readingMin: number; studyMin: number; workoutMin: number; habitsDone: number }> = [];
  for (let i = Math.min(days, 30) - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dStr = d.toISOString().slice(0, 10);
    const rMin = Math.round(
      readingSessions.filter((x) => String(x.started_at).slice(0, 10) === dStr).reduce((s, x) => s + Number(x.duration_seconds || 0), 0) / 60
    );
    const sMin = Math.round(
      studySessions.filter((x) => String(x.started_at).slice(0, 10) === dStr).reduce((s, x) => s + Number(x.duration_seconds || 0), 0) / 60
    );
    const wMin = workouts.filter((x) => x.session_date === dStr).reduce((s, x) => s + Number(x.duration_minutes || 0), 0);
    const hDone = habitLogs.filter((x) => x.log_date === dStr && x.completed === 1).length;
    dailySeries.push({ date: dStr, readingMin: rMin, studyMin: sMin, workoutMin: wMin, habitsDone: hDone });
  }

  return {
    range,
    sinceDate: sinceStr,
    metrics: {
      tasks: {
        total: recentTasks.length,
        completed: completedTasks,
        completionRate: taskCompletionRate,
        trackedMinutes: Math.round(taskSessions.reduce((s, x) => s + Number(x.duration_seconds || 0), 0) / 60),
      },
      habits: {
        loggedEntries: habitLogs.length,
        completedEntries: habitCompletedCount,
        consistencyRate: habitRate,
      },
      reading: {
        sessionsCount: readingSessions.length,
        minutes: readingMinutes,
        pagesRead,
      },
      study: {
        sessionsCount: studySessions.length,
        recentMinutes: studyMinutes,
        totalActualMinutes: totalTopicStudyMinutes,
        totalPlannedMinutes: totalTopicPlannedMinutes,
        completedTopics: studyTopics.filter((t) => t.status === 'completed').length,
        totalTopics: studyTopics.length,
      },
      english: {
        vocabTotal: vocab.length,
        vocabMastered: vocab.filter((v) => v.mastered === 1).length,
        speakingRecordings: recordings.length,
      },
      workout: {
        sessionsCount: workouts.length,
        totalMinutes: workouts.reduce((s, w) => s + Number(w.duration_minutes || 0), 0),
      },
      goals: {
        total: goals.length,
        active: goals.filter((g) => g.status === 'active').length,
        completed: goals.filter((g) => g.status === 'completed').length,
      },
    },
    dailySeries,
    methodology: {
      tasks: 'Completed top-level tasks divided by total tasks in the selected date window. Returns N/A when no tasks exist.',
      habits: 'Completed habit log entries divided by logged habit entries in range.',
      reading: 'Sum of logged reading session durations and pages read.',
      study: 'Actual minutes from Study Sessions & Topic timers compared against sum of topic planned_minutes.',
      english: 'Vocabulary items marked mastered after >= 4 SM-2 reviews and >= 14d interval, plus saved Speaking Studio recordings.',
    },
  };
}
