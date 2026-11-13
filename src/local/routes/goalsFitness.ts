import { getLocalDb } from '../sqliteDriver.ts';
import { uid } from '../schema.ts';
import { LocalHttpError } from '../httpError.ts';
import { saveUploadedFile } from '../fileStorage.ts';
import { calculateGoalProgress, evaluateGoalSchedule } from '../../shared/logic.ts';
import type { Goal, GoalMilestone } from '../../shared/types.ts';

export async function listGoals() {
  const db = await getLocalDb();
  const goals = (await db.all('SELECT * FROM goals ORDER BY target_date ASC')) as unknown as Goal[];
  const milestones = (await db.all('SELECT * FROM goal_milestones ORDER BY sort_order ASC')) as unknown as GoalMilestone[];
  const links = await db.all<Record<string, any>>('SELECT * FROM goal_links');
  const tasks = await db.all<Record<string, any>>('SELECT id, title, status, due_date FROM tasks');
  const books = await db.all<Record<string, any>>('SELECT id, title, status, progress_percent FROM books');
  const courses = await db.all<Record<string, any>>('SELECT id, title FROM courses');
  const topics = await db.all<Record<string, any>>('SELECT id, course_id, status FROM study_topics');
  const habits = await db.all<Record<string, any>>('SELECT id, title FROM habits');
  const today = new Date().toISOString().slice(0, 10);

  const computeLinkedRatio = (goalId: string): number | null => {
    const gLinks = links.filter((l) => l.goal_id === goalId);
    if (gLinks.length === 0) return null;
    let sum = 0;
    for (const l of gLinks) {
      if (l.entity_type === 'task') {
        const t = tasks.find((x) => x.id === l.entity_id);
        sum += t?.status === 'completed' ? 1 : 0;
      } else if (l.entity_type === 'book') {
        const b = books.find((x) => x.id === l.entity_id);
        sum += b ? Number(b.progress_percent || 0) / 100 : 0;
      } else if (l.entity_type === 'course') {
        const cTopics = topics.filter((t) => t.course_id === l.entity_id);
        sum += cTopics.length > 0 ? cTopics.filter((t) => t.status === 'completed').length / cTopics.length : 0;
      } else if (l.entity_type === 'topic') {
        const t = topics.find((x) => x.id === l.entity_id);
        sum += t?.status === 'completed' ? 1 : 0;
      } else {
        sum += 0.5;
      }
    }
    return sum / gLinks.length;
  };

  const progressCache = new Map<string, number>();
  const getProgress = (goal: Goal): number => {
    if (progressCache.has(goal.id)) return progressCache.get(goal.id)!;
    const childGoals = goals.filter((g) => g.parent_goal_id === goal.id);
    const childProgress = childGoals.map((cg) => getProgress(cg));
    const gMilestones = milestones.filter((m) => m.goal_id === goal.id);
    const ratio = computeLinkedRatio(goal.id);
    const p = calculateGoalProgress({
      goal,
      milestones: gMilestones,
      childGoalsProgress: childProgress,
      linkedCompletionRatio: ratio,
    });
    progressCache.set(goal.id, p);
    return p;
  };

  const enriched = goals.map((g) => {
    const progress = getProgress(g);
    const scheduleEval = evaluateGoalSchedule({
      startDate: g.start_date,
      targetDate: g.target_date,
      todayStr: today,
      actualPercent: progress,
      status: g.status,
    });
    const gMilestones = milestones.filter((m) => m.goal_id === g.id);
    const gLinks = links.filter((l) => l.goal_id === g.id);

    const words = g.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const linkedSet = new Set(gLinks.map((l) => `${l.entity_type}:${l.entity_id}`));
    const suggestions: Array<{ entity_type: string; entity_id: string; entity_title: string }> = [];
    for (const t of tasks) {
      if (!linkedSet.has(`task:${t.id}`) && words.some((w) => String(t.title).toLowerCase().includes(w))) {
        suggestions.push({ entity_type: 'task', entity_id: t.id, entity_title: t.title });
      }
    }
    for (const b of books) {
      if (!linkedSet.has(`book:${b.id}`) && words.some((w) => String(b.title).toLowerCase().includes(w))) {
        suggestions.push({ entity_type: 'book', entity_id: b.id, entity_title: b.title });
      }
    }
    for (const c of courses) {
      if (!linkedSet.has(`course:${c.id}`) && words.some((w) => String(c.title).toLowerCase().includes(w))) {
        suggestions.push({ entity_type: 'course', entity_id: c.id, entity_title: c.title });
      }
    }

    return {
      ...g,
      progress,
      scheduleEvaluation: scheduleEval,
      milestones: gMilestones,
      links: gLinks,
      suggestions: suggestions.slice(0, 4),
    };
  });

  return {
    goals: enriched,
    linkableEntities: {
      tasks: tasks.map((t) => ({ id: t.id, title: t.title })),
      books: books.map((b) => ({ id: b.id, title: b.title })),
      courses: courses.map((c) => ({ id: c.id, title: c.title })),
      habits: habits.map((h) => ({ id: h.id, title: h.title })),
    },
  };
}

export async function createGoal(body: any) {
  const db = await getLocalDb();
  const {
    parent_goal_id = null,
    title,
    description = '',
    area = 'Personal',
    horizon = 'monthly',
    start_date = new Date().toISOString().slice(0, 10),
    target_date,
  } = body ?? {};
  if (!title || !target_date) {
    throw new LocalHttpError(400, 'Goal title and target date are required.');
  }
  const now = new Date().toISOString();
  const id = uid('goal');
  await db.run(
    `INSERT INTO goals (id, parent_goal_id, title, description, area, horizon, start_date, target_date, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    [id, parent_goal_id || null, String(title).trim(), String(description), area, horizon, start_date, target_date, now, now]
  );
  return { goal: await db.get('SELECT * FROM goals WHERE id = ?', [id]) };
}

export async function updateGoal(id: string, body: any) {
  const db = await getLocalDb();
  const existing = await db.get<Record<string, any>>('SELECT * FROM goals WHERE id = ?', [id]);
  if (!existing) throw new LocalHttpError(404, 'Goal not found');
  const b = body ?? {};
  await db.run(
    `UPDATE goals SET title = ?, description = ?, area = ?, horizon = ?, start_date = ?, target_date = ?, status = ?, manual_progress_override = ?, updated_at = ?
     WHERE id = ?`,
    [
      b.title !== undefined ? String(b.title).trim() : existing.title,
      b.description !== undefined ? String(b.description) : existing.description,
      b.area ?? existing.area,
      b.horizon ?? existing.horizon,
      b.start_date ?? existing.start_date,
      b.target_date ?? existing.target_date,
      b.status ?? existing.status,
      b.manual_progress_override !== undefined ? b.manual_progress_override : existing.manual_progress_override,
      new Date().toISOString(),
      id,
    ]
  );
  return { goal: await db.get('SELECT * FROM goals WHERE id = ?', [id]) };
}

export async function approveGoalRevision(id: string, body: any) {
  const db = await getLocalDb();
  const { new_target_date, redistribute_linked_tasks = false } = body ?? {};
  if (!new_target_date) {
    throw new LocalHttpError(400, 'new_target_date is required.');
  }
  const now = new Date().toISOString();
  await db.run('UPDATE goals SET target_date = ?, updated_at = ? WHERE id = ?', [new_target_date, now, id]);
  await db.run(
    'INSERT INTO goal_progress_events (id, goal_id, event_note, progress_snapshot, created_at) VALUES (?, ?, ?, ?, ?)',
    [uid('gpe'), id, `User approved schedule revision to ${new_target_date}`, 0, now]
  );

  if (redistribute_linked_tasks) {
    const today = now.slice(0, 10);
    const links = await db.all<{ entity_id: string }>(
      "SELECT entity_id FROM goal_links WHERE goal_id = ? AND entity_type = 'task'",
      [id]
    );
    for (const l of links) {
      await db.run(
        "UPDATE tasks SET due_date = ?, updated_at = ? WHERE id = ? AND status IN ('todo','in_progress') AND (due_date IS NULL OR due_date < ?)",
        [today, now, l.entity_id, today]
      );
    }
  }
  return { ok: true };
}

export async function deleteGoal(id: string) {
  await (await getLocalDb()).run('DELETE FROM goals WHERE id = ?', [id]);
  return { ok: true };
}

export async function createMilestone(goalId: string, body: any) {
  const db = await getLocalDb();
  const { title, due_date = null } = body ?? {};
  if (!title || !String(title).trim()) throw new LocalHttpError(400, 'Milestone title is required.');
  const id = uid('gm');
  await db.run(
    'INSERT INTO goal_milestones (id, goal_id, title, due_date, completed, sort_order) VALUES (?, ?, ?, ?, 0, ?)',
    [id, goalId, String(title).trim(), due_date || null, Date.now()]
  );
  return { milestone: await db.get('SELECT * FROM goal_milestones WHERE id = ?', [id]) };
}

export async function toggleMilestone(id: string) {
  const db = await getLocalDb();
  const m = await db.get<Record<string, any>>('SELECT * FROM goal_milestones WHERE id = ?', [id]);
  if (!m) throw new LocalHttpError(404, 'Milestone not found');
  const next = m.completed ? 0 : 1;
  await db.run('UPDATE goal_milestones SET completed = ?, completed_at = ? WHERE id = ?', [
    next,
    next ? new Date().toISOString() : null,
    id,
  ]);
  return { ok: true };
}

export async function deleteMilestone(id: string) {
  await (await getLocalDb()).run('DELETE FROM goal_milestones WHERE id = ?', [id]);
  return { ok: true };
}

export async function createGoalLink(goalId: string, body: any) {
  const db = await getLocalDb();
  const { entity_type, entity_id, entity_title } = body ?? {};
  if (!entity_type || !entity_id || !entity_title) {
    throw new LocalHttpError(400, 'entity_type, entity_id, and entity_title are required.');
  }
  const id = uid('gl');
  await db.run(
    'INSERT INTO goal_links (id, goal_id, entity_type, entity_id, entity_title) VALUES (?, ?, ?, ?, ?)',
    [id, goalId, entity_type, entity_id, entity_title]
  );
  return { link: await db.get('SELECT * FROM goal_links WHERE id = ?', [id]) };
}

export async function deleteGoalLink(id: string) {
  await (await getLocalDb()).run('DELETE FROM goal_links WHERE id = ?', [id]);
  return { ok: true };
}

// ======================== WORKOUT & FITNESS (SECONDARY) ========================
export async function getFitnessOverview() {
  const db = await getLocalDb();
  const categories = await db.all('SELECT * FROM workout_categories ORDER BY is_custom ASC, name ASC');
  const exercises = await db.all('SELECT * FROM exercises ORDER BY name ASC');
  const plans = await db.all('SELECT * FROM workout_plans ORDER BY created_at DESC');
  const sessions = await db.all<Record<string, any>>('SELECT * FROM workout_sessions ORDER BY session_date DESC, created_at DESC');
  const sets = await db.all<Record<string, any>>('SELECT * FROM workout_sets ORDER BY set_number ASC');
  const measurements = await db.all('SELECT * FROM body_measurements ORDER BY measured_at DESC');
  const recoveryLogs = await db.all('SELECT * FROM nutrition_recovery_logs ORDER BY log_date DESC');

  const sessionsWithSets = sessions.map((s) => ({
    ...s,
    sets: sets.filter((x) => x.session_id === s.id),
  }));

  return { categories, exercises, plans, sessions: sessionsWithSets, measurements, recoveryLogs };
}

export async function createWorkoutCategory(body: any) {
  const db = await getLocalDb();
  const { name } = body ?? {};
  if (!name || !String(name).trim()) throw new LocalHttpError(400, 'Category name is required.');
  const id = uid('wcat');
  await db.run('INSERT INTO workout_categories (id, name, is_custom) VALUES (?, ?, 1)', [id, String(name).trim()]);
  return { category: await db.get('SELECT * FROM workout_categories WHERE id = ?', [id]) };
}

export async function createExercise(body: any) {
  const db = await getLocalDb();
  const { category_id, name, instructions = '' } = body ?? {};
  if (!category_id || !name) throw new LocalHttpError(400, 'Category and exercise name are required.');
  const id = uid('ex');
  await db.run('INSERT INTO exercises (id, category_id, name, instructions, is_custom) VALUES (?, ?, ?, ?, 1)', [
    id,
    category_id,
    String(name).trim(),
    String(instructions),
  ]);
  return { exercise: await db.get('SELECT * FROM exercises WHERE id = ?', [id]) };
}

export async function createWorkoutSession(body: any) {
  const db = await getLocalDb();
  const {
    title,
    category_name = 'Strength Training',
    session_date = new Date().toISOString().slice(0, 10),
    duration_minutes = 30,
    estimated_calories = null,
    notes = '',
    sets = [],
  } = body ?? {};
  if (!title || !String(title).trim()) throw new LocalHttpError(400, 'Workout session title is required.');
  const id = uid('ws');
  await db.run(
    `INSERT INTO workout_sessions (id, title, category_name, session_date, duration_minutes, estimated_calories, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      String(title).trim(),
      category_name,
      session_date,
      Math.max(0, Number(duration_minutes)),
      estimated_calories !== null && estimated_calories !== '' ? Number(estimated_calories) : null,
      String(notes),
      new Date().toISOString(),
    ]
  );

  if (Array.isArray(sets)) {
    for (let idx = 0; idx < sets.length; idx++) {
      const s = sets[idx];
      if (!s.exercise_name) continue;
      const prev = await db.get<{ max_w: number | null }>(
        'SELECT MAX(weight_kg) as max_w FROM workout_sets WHERE exercise_name = ?',
        [s.exercise_name]
      );
      const prevMax = prev?.max_w ?? 0;
      const w = Number(s.weight_kg || 0);
      const isPr = w > 0 && w > prevMax ? 1 : 0;
      await db.run(
        'INSERT INTO workout_sets (id, session_id, exercise_name, set_number, reps, weight_kg, is_pr) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [uid('wset'), id, String(s.exercise_name), idx + 1, Number(s.reps || 0), w, isPr]
      );
    }
  }

  return { session: await db.get('SELECT * FROM workout_sessions WHERE id = ?', [id]) };
}

export async function deleteWorkoutSession(id: string) {
  await (await getLocalDb()).run('DELETE FROM workout_sessions WHERE id = ?', [id]);
  return { ok: true };
}

export async function createMeasurement(body: FormData | Record<string, any>) {
  const db = await getLocalDb();
  let measured_at = new Date().toISOString().slice(0, 10);
  let weight_kg: any = null;
  let waist_cm: any = null;
  let chest_cm: any = null;
  let arm_cm: any = null;
  let notes = '';
  let photoPath: string | null = null;

  if (body instanceof FormData) {
    measured_at = String(body.get('measured_at') || measured_at);
    weight_kg = body.get('weight_kg');
    waist_cm = body.get('waist_cm');
    chest_cm = body.get('chest_cm');
    arm_cm = body.get('arm_cm');
    notes = String(body.get('notes') || '');
    const photo = body.get('photo');
    if (photo instanceof File && photo.size > 0) {
      photoPath = await saveUploadedFile('photos', photo, photo.name);
    }
  } else if (body) {
    measured_at = body.measured_at || measured_at;
    weight_kg = body.weight_kg ?? null;
    waist_cm = body.waist_cm ?? null;
    chest_cm = body.chest_cm ?? null;
    arm_cm = body.arm_cm ?? null;
    notes = String(body.notes || '');
  }

  const id = uid('bm');
  await db.run(
    `INSERT INTO body_measurements (id, measured_at, weight_kg, waist_cm, chest_cm, arm_cm, photo_path, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      measured_at,
      weight_kg ? Number(weight_kg) : null,
      waist_cm ? Number(waist_cm) : null,
      chest_cm ? Number(chest_cm) : null,
      arm_cm ? Number(arm_cm) : null,
      photoPath,
      notes,
    ]
  );
  return { measurement: await db.get('SELECT * FROM body_measurements WHERE id = ?', [id]) };
}

export async function saveRecoveryLog(body: any) {
  const db = await getLocalDb();
  const {
    log_date = new Date().toISOString().slice(0, 10),
    water_ml = 0,
    meals_summary = '',
    sleep_hours = null,
    energy_level = null,
    is_rest_day = 0,
    notes = '',
  } = body ?? {};
  const existing = await db.get<{ id: string }>('SELECT id FROM nutrition_recovery_logs WHERE log_date = ?', [log_date]);
  if (existing) {
    await db.run(
      `UPDATE nutrition_recovery_logs SET water_ml = ?, meals_summary = ?, sleep_hours = ?, energy_level = ?, is_rest_day = ?, notes = ?
       WHERE id = ?`,
      [
        Number(water_ml || 0),
        String(meals_summary),
        sleep_hours ? Number(sleep_hours) : null,
        energy_level ? Number(energy_level) : null,
        is_rest_day ? 1 : 0,
        String(notes),
        existing.id,
      ]
    );
  } else {
    await db.run(
      `INSERT INTO nutrition_recovery_logs (id, log_date, water_ml, meals_summary, sleep_hours, energy_level, is_rest_day, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uid('nrl'),
        log_date,
        Number(water_ml || 0),
        String(meals_summary),
        sleep_hours ? Number(sleep_hours) : null,
        energy_level ? Number(energy_level) : null,
        is_rest_day ? 1 : 0,
        String(notes),
      ]
    );
  }
  return { ok: true };
}
