import type { SqlDriver } from './schema.ts';

function todayOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function loadSampleData(db: SqlDriver): Promise<void> {
  const now = new Date().toISOString();
  const today = todayOffset(0);
  const yesterday = todayOffset(-1);
  const nextWeek = todayOffset(7);
  const nextMonth = todayOffset(30);
  const lastMonth = todayOffset(-30);

  await db.transaction(async () => {
    const bookSql = `
      INSERT OR IGNORE INTO books (
        id, title, author, category, description, status, queue_bucket, queue_order,
        total_pages, current_page, progress_percent, target_finish_date, is_sample, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `;
    await db.run(bookSql, [
      'sample_book_1',
      'Deep Work (Sample)',
      'Cal Newport',
      'Productivity',
      'Rules for focused success in a distracted world.',
      'reading',
      'NOW',
      0,
      296,
      118,
      40,
      todayOffset(14),
      now,
      now,
    ]);
    await db.run(bookSql, [
      'sample_book_2',
      'Designing Data-Intensive Applications (Sample)',
      'Martin Kleppmann',
      'Software Engineering',
      'Core principles behind reliable, scalable, and maintainable systems.',
      'want_to_read',
      'NEXT',
      1,
      611,
      0,
      0,
      todayOffset(60),
      now,
      now,
    ]);
    await db.run(bookSql, [
      'sample_book_3',
      'Atomic Habits (Sample)',
      'James Clear',
      'Habits',
      'Tiny changes, remarkable results.',
      'finished',
      'LATER',
      2,
      320,
      320,
      100,
      yesterday,
      now,
      now,
    ]);

    await db.run(
      `INSERT OR IGNORE INTO reading_sessions (id, book_id, started_at, ended_at, duration_seconds, start_page, end_page, pages_read, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'sample_rs_1',
        'sample_book_1',
        `${yesterday}T20:00:00.000Z`,
        `${yesterday}T20:35:00.000Z`,
        2100,
        96,
        118,
        22,
        'Chapter on embracing boredom and scheduling deep blocks.',
        now,
      ]
    );

    await db.run(
      `INSERT OR IGNORE INTO book_notes (id, book_id, note_type, page_or_location, content, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        'sample_bn_1',
        'sample_book_1',
        'quote',
        'p. 104',
        'Clarity about what matters provides clarity about what does not.',
        now,
      ]
    );

    const taskSql = `
      INSERT OR IGNORE INTO tasks (
        id, title, description, task_type, parent_task_id, project_id, priority, status,
        mandatory, category, tags_json, due_date, scheduled_start, scheduled_end,
        recurrence_rule, estimated_minutes, is_sample, completed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `;
    await db.run(taskSql, [
      'sample_proj_1',
      'Quarterly System Architecture Study (Sample)',
      'Structured study project covering distributed storage and reliability.',
      'project',
      null,
      null,
      'high',
      'in_progress',
      1,
      'Engineering',
      '["architecture","study"]',
      nextMonth,
      null,
      null,
      null,
      180,
      null,
      now,
      now,
    ]);
    await db.run(taskSql, [
      'sample_task_1',
      'Review morning priority list & block deep work (Sample)',
      'Set today NOW/NEXT items before opening messages.',
      'recurring',
      null,
      null,
      'high',
      'completed',
      1,
      'Planning',
      '["routine"]',
      today,
      '08:30',
      '09:00',
      'daily',
      20,
      now,
      now,
      now,
    ]);
    await db.run(taskSql, [
      'sample_task_2',
      'Draft database schema notes for SQLite module (Sample)',
      'Document foreign keys and migration rollback approach.',
      'scheduled',
      null,
      'sample_proj_1',
      'urgent',
      'todo',
      1,
      'Engineering',
      '["sqlite","docs"]',
      today,
      '10:00',
      '11:30',
      null,
      90,
      null,
      now,
      now,
    ]);
    await db.run(taskSql, [
      'sample_task_3',
      'Verify backup archive integrity (Sample)',
      'Run sample backup & restore verification.',
      'one_time',
      null,
      'sample_proj_1',
      'medium',
      'todo',
      0,
      'Operations',
      '["backup"]',
      today,
      null,
      null,
      null,
      25,
      null,
      now,
      now,
    ]);
    await db.run(taskSql, [
      'sample_task_4',
      'Clean up stale inbox bookmarks (Sample)',
      'Overdue sample task to demonstrate explicit Reschedule / Carry Forward / Skip.',
      'one_time',
      null,
      null,
      'low',
      'todo',
      0,
      'Admin',
      '["cleanup"]',
      yesterday,
      null,
      null,
      null,
      15,
      null,
      now,
      now,
    ]);
    await db.run(taskSql, [
      'sample_sub_1',
      'List core entity tables and cardinalities',
      '',
      'one_time',
      'sample_task_2',
      'sample_proj_1',
      'medium',
      'completed',
      1,
      'Engineering',
      '[]',
      today,
      null,
      null,
      null,
      15,
      now,
      now,
      now,
    ]);

    await db.run(
      `INSERT OR IGNORE INTO task_dependencies (id, task_id, prerequisite_task_id) VALUES (?, ?, ?)`,
      ['sample_dep_1', 'sample_task_3', 'sample_task_2']
    );

    const habitSql = `
      INSERT OR IGNORE INTO habits (id, title, description, frequency, tracking_type, target_value, unit, mandatory, category, is_sample, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `;
    await db.run(habitSql, ['sample_hab_1', 'Hydration 2.5L (Sample)', 'Track daily water intake.', 'daily', 'quantity', 2500, 'ml', 1, 'Health', now]);
    await db.run(habitSql, ['sample_hab_2', '20-Min Focused Reading (Sample)', 'Uninterrupted book reading.', 'daily', 'duration', 20, 'min', 0, 'Reading', now]);
    await db.run(habitSql, ['sample_hab_3', 'Weekly Review & Reflection (Sample)', 'Review weekly milestones.', 'weekly', 'checkbox', 1, 'session', 0, 'Planning', now]);
    await db.run(
      `INSERT OR IGNORE INTO habit_logs (id, habit_id, log_date, value, completed, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['sample_hl_1', 'sample_hab_1', yesterday, 2500, 1, 'Hit target', now]
    );

    const dayOfWeek = new Date().getDay();
    const blkSql = `
      INSERT OR IGNORE INTO weekly_template_blocks (id, day_of_week, start_time, end_time, title, module, mandatory)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    await db.run(blkSql, [`sample_blk_${dayOfWeek}_1`, dayOfWeek, '09:00', '10:30', 'Morning Deep Study Block (Sample)', 'study', 1]);
    await db.run(blkSql, [`sample_blk_${dayOfWeek}_2`, dayOfWeek, '17:30', '18:00', 'English Speaking & Vocabulary (Sample)', 'english', 1]);
    await db.run(blkSql, [`sample_blk_${dayOfWeek}_3`, dayOfWeek, '20:30', '21:15', 'Evening Reading Session (Sample)', 'reading', 0]);

    await db.run(
      `INSERT OR IGNORE INTO learning_paths (id, title, description, target_hours, is_sample, created_at) VALUES (?, ?, ?, ?, 1, ?)`,
      ['sample_lp_1', 'Systems & Reliability Engineering (Sample)', 'Core distributed systems and Linux internals.', 60, now]
    );
    await db.run(
      `INSERT OR IGNORE INTO courses (id, learning_path_id, title, provider, description, planned_hours, is_sample, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      ['sample_course_1', 'sample_lp_1', 'SQLite Internals & Local-First Apps (Sample)', 'Self-Directed', 'B-trees, migrations, and safe backups.', 20, now]
    );
    await db.run(
      `INSERT OR IGNORE INTO course_modules (id, course_id, title, sort_order) VALUES (?, ?, ?, ?)`,
      ['sample_mod_1', 'sample_course_1', 'Module 1: Storage Engine & Transactions', 1]
    );
    await db.run(
      `INSERT OR IGNORE INTO study_topics (id, module_id, course_id, title, topic_kind, status, study_seconds, planned_minutes, last_studied_at, revision_count, next_review_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['sample_top_1', 'sample_mod_1', 'sample_course_1', 'SQLite Storage & Checkpoints (Sample)', 'lesson', 'needs_revision', 2700, 45, yesterday, 1, today, now]
    );
    await db.run(
      `INSERT OR IGNORE INTO study_topics (id, module_id, course_id, title, topic_kind, status, study_seconds, planned_minutes, last_studied_at, revision_count, next_review_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['sample_top_2', 'sample_mod_1', 'sample_course_1', 'Foreign Keys & Cascading Deletes Lab (Sample)', 'lab', 'in_progress', 900, 60, yesterday, 0, nextWeek, now]
    );
    await db.run(
      `INSERT OR IGNORE INTO topic_notes (id, topic_id, section_type, title, content, code_snippet, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        'sample_tn_1',
        'sample_top_1',
        'commands',
        'Enabling Foreign Keys & Safe Transactions',
        'Foreign keys enforce referential integrity across linked records.',
        'PRAGMA foreign_keys = ON;',
        now,
      ]
    );

    const vocabSql = `
      INSERT OR IGNORE INTO vocabulary_items (id, word, meaning, part_of_speech, example, tags, next_review_date, is_sample, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `;
    await db.run(vocabSql, ['sample_voc_1', 'articulate', 'Expressing ideas clearly and effectively in speech or writing.', 'adjective', 'She gave an articulate explanation of the trade-offs.', 'communication,interview', today, now]);
    await db.run(vocabSql, ['sample_voc_2', 'resilient', 'Able to withstand or recover quickly from difficult conditions.', 'adjective', 'A resilient local-first app continues working offline.', 'technical,core', today, now]);

    await db.run(
      `INSERT OR IGNORE INTO english_daily_plan (id, skill, title, target_minutes, completed_today) VALUES (?, ?, ?, ?, ?)`,
      ['sample_ep_1', 'vocabulary', 'Review 10 spaced-repetition flashcards (Sample)', 10, 0]
    );
    await db.run(
      `INSERT OR IGNORE INTO english_daily_plan (id, skill, title, target_minutes, completed_today) VALUES (?, ?, ?, ?, ?)`,
      ['sample_ep_2', 'speaking', '2-minute recorded summary of today’s topic (Sample)', 10, 0]
    );
    await db.run(
      `INSERT OR IGNORE INTO cefr_assessments (id, assessed_at, overall_level, speaking, listening, reading, writing, vocabulary, grammar, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['sample_cefr_1', today, 'B2', 'B1', 'B2', 'C1', 'B2', 'B2', 'B2', 'Sample baseline assessment.']
    );

    await db.run(
      `INSERT OR IGNORE INTO goals (id, parent_goal_id, title, description, area, horizon, start_date, target_date, status, is_sample, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?)`,
      [
        'sample_goal_1',
        null,
        'Reach C1 Technical English & Complete Systems Track (Sample)',
        'Combine consistent daily English practice with architecture study.',
        'Career',
        'yearly',
        lastMonth,
        nextMonth,
        now,
        now,
      ]
    );
    await db.run(
      `INSERT OR IGNORE INTO goal_milestones (id, goal_id, title, due_date, completed, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['sample_gm_1', 'sample_goal_1', 'Finish SQLite Internals Module', nextWeek, 0, 1]
    );
    await db.run(
      `INSERT OR IGNORE INTO goal_links (id, goal_id, entity_type, entity_id, entity_title)
       VALUES (?, ?, ?, ?, ?)`,
      ['sample_gl_1', 'sample_goal_1', 'course', 'sample_course_1', 'SQLite Internals & Local-First Apps (Sample)']
    );

    await db.run(
      `INSERT OR IGNORE INTO workout_sessions (id, title, category_name, session_date, duration_minutes, estimated_calories, notes, is_sample, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      ['sample_ws_1', 'Upper Body Strength (Sample)', 'Strength Training', yesterday, 40, 240, 'Controlled tempo.', now]
    );

    await db.run(`UPDATE user_settings SET sample_data_loaded = 1, onboarding_completed = 1, updated_at = ? WHERE id = 1`, [now]);
  });
}

export async function clearSampleData(db: SqlDriver): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction(async () => {
    await db.run(`DELETE FROM books WHERE is_sample = 1;`);
    await db.run(`DELETE FROM tasks WHERE is_sample = 1;`);
    await db.run(`DELETE FROM habits WHERE is_sample = 1;`);
    await db.run(`DELETE FROM weekly_template_blocks WHERE id LIKE 'sample_%';`);
    await db.run(`DELETE FROM learning_paths WHERE is_sample = 1;`);
    await db.run(`DELETE FROM courses WHERE is_sample = 1;`);
    await db.run(`DELETE FROM vocabulary_items WHERE is_sample = 1;`);
    await db.run(`DELETE FROM english_daily_plan WHERE id LIKE 'sample_%';`);
    await db.run(`DELETE FROM cefr_assessments WHERE id LIKE 'sample_%';`);
    await db.run(`DELETE FROM goals WHERE is_sample = 1;`);
    await db.run(`DELETE FROM workout_sessions WHERE is_sample = 1;`);
    await db.run(`UPDATE user_settings SET sample_data_loaded = 0, updated_at = ? WHERE id = 1`, [now]);
  });
}
