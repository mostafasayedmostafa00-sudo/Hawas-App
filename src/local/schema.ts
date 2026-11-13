export interface SqlDriver {
  readonly kind: 'capacitor-sqlite' | 'sqljs' | 'node-sqlite';
  exec(sql: string): Promise<void>;
  run(sql: string, params?: unknown[]): Promise<void>;
  all<T = Record<string, any>>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T = Record<string, any>>(sql: string, params?: unknown[]): Promise<T | undefined>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  persist?(): Promise<void>;
  close?(): Promise<void>;
}

export const SCHEMA_DDL_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS user_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    profile_name TEXT NOT NULL DEFAULT 'Learner',
    profile_bio TEXT NOT NULL DEFAULT '',
    theme TEXT NOT NULL DEFAULT 'light',
    week_start_day TEXT NOT NULL DEFAULT 'monday',
    date_format TEXT NOT NULL DEFAULT 'YYYY-MM-DD',
    time_format TEXT NOT NULL DEFAULT '24h',
    notifications_enabled INTEGER NOT NULL DEFAULT 1,
    daily_focus_start TEXT NOT NULL DEFAULT '08:00',
    daily_focus_end TEXT NOT NULL DEFAULT '22:00',
    onboarding_completed INTEGER NOT NULL DEFAULT 0,
    sample_data_loaded INTEGER NOT NULL DEFAULT 0,
    score_weights_json TEXT NOT NULL DEFAULT '{"tasks":30,"habits":20,"reading":15,"study":20,"english":10,"workout":5}',
    ai_enabled INTEGER NOT NULL DEFAULT 1,
    ai_tutor_level TEXT NOT NULL DEFAULT 'B2',
    app_lock_enabled INTEGER NOT NULL DEFAULT 0,
    app_lock_pin_hash TEXT,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT '',
    cover_path TEXT,
    category TEXT NOT NULL DEFAULT 'General',
    description TEXT NOT NULL DEFAULT '',
    external_link TEXT,
    status TEXT NOT NULL DEFAULT 'want_to_read' CHECK (status IN ('want_to_read','reading','paused','finished','dropped')),
    queue_bucket TEXT NOT NULL DEFAULT 'LATER' CHECK (queue_bucket IN ('NOW','NEXT','LATER','NONE')),
    queue_order INTEGER NOT NULL DEFAULT 0,
    total_pages INTEGER,
    current_page INTEGER NOT NULL DEFAULT 0,
    current_location TEXT,
    progress_percent INTEGER NOT NULL DEFAULT 0,
    target_finish_date TEXT,
    is_sample INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_books_status ON books(status);`,
  `CREATE INDEX IF NOT EXISTS idx_books_queue ON books(queue_bucket, queue_order);`,
  `CREATE TABLE IF NOT EXISTS book_files (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL CHECK (file_type IN ('pdf','epub','other')),
    storage_path TEXT NOT NULL,
    file_size INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_book_files_book ON book_files(book_id);`,
  `CREATE TABLE IF NOT EXISTS reading_sessions (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    start_page INTEGER NOT NULL DEFAULT 0,
    end_page INTEGER NOT NULL DEFAULT 0,
    pages_read INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_reading_sessions_book ON reading_sessions(book_id);`,
  `CREATE INDEX IF NOT EXISTS idx_reading_sessions_started ON reading_sessions(started_at);`,
  `CREATE TABLE IF NOT EXISTS book_highlights (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    page_or_location TEXT NOT NULL DEFAULT '',
    excerpt TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT 'amber',
    created_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS book_notes (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    note_type TEXT NOT NULL DEFAULT 'note' CHECK (note_type IN ('note','idea','quote','question')),
    page_or_location TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS book_bookmarks (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    page_or_location TEXT NOT NULL,
    created_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    task_type TEXT NOT NULL DEFAULT 'one_time' CHECK (task_type IN ('one_time','recurring','project','quick','scheduled')),
    parent_task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
    project_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('urgent','high','medium','low')),
    status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','completed','on_hold','cancelled')),
    mandatory INTEGER NOT NULL DEFAULT 1,
    category TEXT NOT NULL DEFAULT 'General',
    tags_json TEXT NOT NULL DEFAULT '[]',
    due_date TEXT,
    scheduled_start TEXT,
    scheduled_end TEXT,
    reminder_at TEXT,
    recurrence_rule TEXT,
    estimated_minutes INTEGER,
    is_sample INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);`,
  `CREATE TABLE IF NOT EXISTS task_dependencies (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    prerequisite_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    UNIQUE(task_id, prerequisite_task_id)
  );`,
  `CREATE TABLE IF NOT EXISTS task_sessions (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT ''
  );`,
  `CREATE TABLE IF NOT EXISTS habits (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    frequency TEXT NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily','weekly')),
    tracking_type TEXT NOT NULL DEFAULT 'checkbox' CHECK (tracking_type IN ('checkbox','quantity','duration')),
    target_value REAL NOT NULL DEFAULT 1,
    unit TEXT NOT NULL DEFAULT 'times',
    mandatory INTEGER NOT NULL DEFAULT 0,
    category TEXT NOT NULL DEFAULT 'Health',
    is_sample INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS habit_logs (
    id TEXT PRIMARY KEY,
    habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    log_date TEXT NOT NULL,
    value REAL NOT NULL DEFAULT 0,
    completed INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    UNIQUE(habit_id, log_date)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_habit_logs_date ON habit_logs(log_date);`,
  `CREATE TABLE IF NOT EXISTS weekly_template_blocks (
    id TEXT PRIMARY KEY,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    title TEXT NOT NULL,
    module TEXT NOT NULL DEFAULT 'general',
    mandatory INTEGER NOT NULL DEFAULT 1,
    linked_entity_type TEXT,
    linked_entity_id TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS daily_schedule_exceptions (
    id TEXT PRIMARY KEY,
    exception_date TEXT NOT NULL,
    template_block_id TEXT REFERENCES weekly_template_blocks(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK (action IN ('override','skip','add')),
    title TEXT,
    start_time TEXT,
    end_time TEXT,
    module TEXT,
    mandatory INTEGER
  );`,
  `CREATE TABLE IF NOT EXISTS daily_now_next_state (
    state_date TEXT PRIMARY KEY,
    manual_now_id TEXT,
    next_order_json TEXT NOT NULL DEFAULT '[]',
    skipped_ids_json TEXT NOT NULL DEFAULT '[]',
    completed_blocks_json TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS active_timers (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('task','book','study_topic','english','workout')),
    entity_id TEXT NOT NULL,
    entity_title TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('running','paused')),
    started_at TEXT NOT NULL,
    last_resumed_at TEXT NOT NULL,
    accumulated_seconds INTEGER NOT NULL DEFAULT 0,
    meta_json TEXT NOT NULL DEFAULT '{}'
  );`,
  `CREATE TABLE IF NOT EXISTS learning_paths (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    target_hours REAL,
    is_sample INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY,
    learning_path_id TEXT REFERENCES learning_paths(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    planned_hours REAL,
    is_sample INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS course_modules (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );`,
  `CREATE TABLE IF NOT EXISTS study_topics (
    id TEXT PRIMARY KEY,
    module_id TEXT NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    topic_kind TEXT NOT NULL DEFAULT 'lesson' CHECK (topic_kind IN ('lesson','lab','assignment')),
    status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','completed','needs_revision')),
    study_seconds INTEGER NOT NULL DEFAULT 0,
    planned_minutes INTEGER,
    last_studied_at TEXT,
    revision_count INTEGER NOT NULL DEFAULT 0,
    next_review_date TEXT,
    ease_factor REAL NOT NULL DEFAULT 2.5,
    interval_days INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_study_topics_review ON study_topics(next_review_date);`,
  `CREATE TABLE IF NOT EXISTS learning_resources (
    id TEXT PRIMARY KEY,
    course_id TEXT REFERENCES courses(id) ON DELETE CASCADE,
    topic_id TEXT REFERENCES study_topics(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    url_or_path TEXT NOT NULL,
    created_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS topic_notes (
    id TEXT PRIMARY KEY,
    topic_id TEXT NOT NULL REFERENCES study_topics(id) ON DELETE CASCADE,
    section_type TEXT NOT NULL DEFAULT 'explanation',
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    code_snippet TEXT,
    attachment_path TEXT,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS study_sessions (
    id TEXT PRIMARY KEY,
    topic_id TEXT NOT NULL REFERENCES study_topics(id) ON DELETE CASCADE,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT ''
  );`,
  `CREATE TABLE IF NOT EXISTS assessments (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    score REAL NOT NULL,
    max_score REAL NOT NULL DEFAULT 100,
    attempt_number INTEGER NOT NULL DEFAULT 1,
    taken_at TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT ''
  );`,
  `CREATE TABLE IF NOT EXISTS english_daily_plan (
    id TEXT PRIMARY KEY,
    skill TEXT NOT NULL CHECK (skill IN ('speaking','listening','reading','writing','vocabulary','grammar')),
    title TEXT NOT NULL,
    target_minutes INTEGER NOT NULL DEFAULT 15,
    completed_today INTEGER NOT NULL DEFAULT 0,
    last_completed_date TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS vocabulary_items (
    id TEXT PRIMARY KEY,
    word TEXT NOT NULL,
    meaning TEXT NOT NULL,
    part_of_speech TEXT NOT NULL DEFAULT 'noun',
    example TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '',
    repetitions INTEGER NOT NULL DEFAULT 0,
    interval_days INTEGER NOT NULL DEFAULT 0,
    ease_factor REAL NOT NULL DEFAULT 2.5,
    next_review_date TEXT NOT NULL,
    mastered INTEGER NOT NULL DEFAULT 0,
    is_sample INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_vocab_review ON vocabulary_items(next_review_date);`,
  `CREATE TABLE IF NOT EXISTS speaking_recordings (
    id TEXT PRIMARY KEY,
    topic TEXT NOT NULL,
    audio_path TEXT NOT NULL,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    mistake_notes TEXT NOT NULL DEFAULT '',
    transcript TEXT,
    ai_feedback TEXT,
    created_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS cefr_assessments (
    id TEXT PRIMARY KEY,
    assessed_at TEXT NOT NULL,
    overall_level TEXT NOT NULL,
    speaking TEXT NOT NULL,
    listening TEXT NOT NULL,
    reading TEXT NOT NULL,
    writing TEXT NOT NULL,
    vocabulary TEXT NOT NULL,
    grammar TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT ''
  );`,
  `CREATE TABLE IF NOT EXISTS english_resources (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    url_or_path TEXT NOT NULL,
    skills_json TEXT NOT NULL DEFAULT '[]',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS writing_entries (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    prompt TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    word_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','revised','final')),
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS english_tutor_messages (
    id TEXT PRIMARY KEY,
    mode TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user','assistant')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS workout_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    is_custom INTEGER NOT NULL DEFAULT 0
  );`,
  `CREATE TABLE IF NOT EXISTS exercises (
    id TEXT PRIMARY KEY,
    category_id TEXT NOT NULL REFERENCES workout_categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    instructions TEXT NOT NULL DEFAULT '',
    is_custom INTEGER NOT NULL DEFAULT 0
  );`,
  `CREATE TABLE IF NOT EXISTS workout_plans (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    goal_type TEXT NOT NULL DEFAULT 'strength',
    category_id TEXT NOT NULL REFERENCES workout_categories(id) ON DELETE CASCADE,
    exercises_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS workout_sessions (
    id TEXT PRIMARY KEY,
    plan_id TEXT REFERENCES workout_plans(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    category_name TEXT NOT NULL,
    session_date TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 0,
    estimated_calories INTEGER,
    notes TEXT NOT NULL DEFAULT '',
    is_sample INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_workout_sessions_date ON workout_sessions(session_date);`,
  `CREATE TABLE IF NOT EXISTS workout_sets (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
    exercise_name TEXT NOT NULL,
    set_number INTEGER NOT NULL DEFAULT 1,
    reps INTEGER NOT NULL DEFAULT 0,
    weight_kg REAL NOT NULL DEFAULT 0,
    is_pr INTEGER NOT NULL DEFAULT 0
  );`,
  `CREATE TABLE IF NOT EXISTS body_measurements (
    id TEXT PRIMARY KEY,
    measured_at TEXT NOT NULL,
    weight_kg REAL,
    waist_cm REAL,
    chest_cm REAL,
    arm_cm REAL,
    body_fat_pct REAL,
    photo_path TEXT,
    notes TEXT NOT NULL DEFAULT ''
  );`,
  `CREATE TABLE IF NOT EXISTS nutrition_recovery_logs (
    id TEXT PRIMARY KEY,
    log_date TEXT NOT NULL UNIQUE,
    water_ml INTEGER NOT NULL DEFAULT 0,
    meals_summary TEXT NOT NULL DEFAULT '',
    sleep_hours REAL,
    energy_level INTEGER,
    is_rest_day INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT ''
  );`,
  `CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    parent_goal_id TEXT REFERENCES goals(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    area TEXT NOT NULL DEFAULT 'Personal',
    horizon TEXT NOT NULL DEFAULT 'monthly' CHECK (horizon IN ('daily','weekly','monthly','yearly','long_term')),
    start_date TEXT NOT NULL,
    target_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','paused','archived')),
    manual_progress_override INTEGER,
    is_sample INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS goal_milestones (
    id TEXT PRIMARY KEY,
    goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    due_date TEXT,
    completed INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  );`,
  `CREATE TABLE IF NOT EXISTS goal_links (
    id TEXT PRIMARY KEY,
    goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    entity_title TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS goal_progress_events (
    id TEXT PRIMARY KEY,
    goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    event_note TEXT NOT NULL,
    progress_snapshot INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'system',
    severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','urgent')),
    link_section TEXT,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS backup_metadata (
    id TEXT PRIMARY KEY,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );`,
];

export const EXPORTABLE_TABLES = [
  'user_settings',
  'books',
  'book_files',
  'reading_sessions',
  'book_highlights',
  'book_notes',
  'book_bookmarks',
  'tasks',
  'task_dependencies',
  'task_sessions',
  'habits',
  'habit_logs',
  'weekly_template_blocks',
  'daily_schedule_exceptions',
  'daily_now_next_state',
  'active_timers',
  'learning_paths',
  'courses',
  'course_modules',
  'study_topics',
  'learning_resources',
  'topic_notes',
  'study_sessions',
  'assessments',
  'english_daily_plan',
  'vocabulary_items',
  'speaking_recordings',
  'cefr_assessments',
  'english_resources',
  'writing_entries',
  'english_tutor_messages',
  'workout_categories',
  'exercises',
  'workout_plans',
  'workout_sessions',
  'workout_sets',
  'body_measurements',
  'nutrition_recovery_logs',
  'goals',
  'goal_milestones',
  'goal_links',
  'goal_progress_events',
  'notifications',
] as const;

export async function initializeSchemaAndDefaults(db: SqlDriver): Promise<void> {
  await db.exec('PRAGMA foreign_keys = ON;');
  for (const stmt of SCHEMA_DDL_STATEMENTS) {
    await db.exec(stmt);
  }

  const existingMigration = await db.get<{ version: string }>(
    'SELECT version FROM schema_migrations WHERE version = ?',
    ['001_initial.sql']
  );
  if (!existingMigration) {
    await db.run('INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)', [
      '001_initial.sql',
      new Date().toISOString(),
    ]);
  }

  const now = new Date().toISOString();
  const settingsRow = await db.get('SELECT id FROM user_settings WHERE id = 1');
  if (!settingsRow) {
    await db.run(`INSERT INTO user_settings (id, profile_name, updated_at) VALUES (1, 'Learner', ?)`, [now]);
  }

  const cats = [
    { id: 'cat_strength', name: 'Strength Training' },
    { id: 'cat_cardio', name: 'Running / Cardio' },
    { id: 'cat_flex', name: 'Flexibility / Yoga' },
    { id: 'cat_hiit', name: 'Functional Training / HIIT' },
  ];
  for (const c of cats) {
    await db.run('INSERT OR IGNORE INTO workout_categories (id, name, is_custom) VALUES (?, ?, 0)', [c.id, c.name]);
  }

  const exercises = [
    { id: 'ex_pushup', category_id: 'cat_strength', name: 'Push-Ups', instructions: 'Keep core braced, lower chest near floor, press through palms.' },
    { id: 'ex_squat', category_id: 'cat_strength', name: 'Goblet / Barbell Squat', instructions: 'Brace core, sit hips back and down, drive through mid-foot.' },
    { id: 'ex_row', category_id: 'cat_strength', name: 'Dumbbell Row', instructions: 'Flat back, pull elbow toward hip, control eccentric phase.' },
    { id: 'ex_run', category_id: 'cat_cardio', name: 'Zone 2 Run', instructions: 'Maintain conversational aerobic pace for steady endurance.' },
    { id: 'ex_mobility', category_id: 'cat_flex', name: 'Thoracic & Hip Mobility Flow', instructions: 'Slow controlled breathing through end-range stretches.' },
    { id: 'ex_kettlebell', category_id: 'cat_hiit', name: 'Kettlebell Swings', instructions: 'Hinge at hips, snap glutes explosively, float bell to chest height.' },
  ];
  for (const ex of exercises) {
    await db.run(
      'INSERT OR IGNORE INTO exercises (id, category_id, name, instructions, is_custom) VALUES (?, ?, ?, ?, 0)',
      [ex.id, ex.category_id, ex.name, ex.instructions]
    );
  }

  await db.persist?.();
}

export function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
