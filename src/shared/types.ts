export type ThemeMode = 'light' | 'dark' | 'system';

export type ScoreCategory = 'tasks' | 'habits' | 'reading' | 'study' | 'english' | 'workout';

export interface DailyScoreWeights {
  tasks: number;
  habits: number;
  reading: number;
  study: number;
  english: number;
  workout: number;
}

export interface UserSettings {
  id: number;
  profile_name: string;
  profile_bio: string;
  theme: ThemeMode;
  week_start_day: 'monday' | 'sunday' | 'saturday';
  date_format: 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY';
  time_format: '24h' | '12h';
  notifications_enabled: number;
  daily_focus_start: string;
  daily_focus_end: string;
  onboarding_completed: number;
  sample_data_loaded: number;
  score_weights_json: string;
  ai_enabled: number;
  ai_tutor_level: string;
  app_lock_enabled: number;
  app_lock_pin_hash: string | null;
  updated_at: string;
}

export type BookStatus = 'want_to_read' | 'reading' | 'paused' | 'finished' | 'dropped';
export type QueueBucket = 'NOW' | 'NEXT' | 'LATER' | 'NONE';

export interface Book {
  id: string;
  title: string;
  author: string;
  cover_path: string | null;
  category: string;
  description: string;
  external_link: string | null;
  status: BookStatus;
  queue_bucket: QueueBucket;
  queue_order: number;
  total_pages: number | null;
  current_page: number;
  current_location: string | null;
  progress_percent: number;
  target_finish_date: string | null;
  is_sample: number;
  created_at: string;
  updated_at: string;
}

export interface BookFile {
  id: string;
  book_id: string;
  file_name: string;
  file_type: 'pdf' | 'epub' | 'other';
  storage_path: string;
  file_size: number;
  created_at: string;
}

export interface ReadingSession {
  id: string;
  book_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  start_page: number;
  end_page: number;
  pages_read: number;
  notes: string;
  created_at: string;
}

export interface BookHighlight {
  id: string;
  book_id: string;
  page_or_location: string;
  excerpt: string;
  color: string;
  created_at: string;
}

export interface BookNote {
  id: string;
  book_id: string;
  note_type: 'note' | 'idea' | 'quote' | 'question';
  page_or_location: string;
  content: string;
  created_at: string;
}

export interface BookBookmark {
  id: string;
  book_id: string;
  label: string;
  page_or_location: string;
  created_at: string;
}

export type TaskType = 'one_time' | 'recurring' | 'project' | 'quick' | 'scheduled';
export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low';
export type TaskStatus = 'todo' | 'in_progress' | 'completed' | 'on_hold' | 'cancelled';

export interface Task {
  id: string;
  title: string;
  description: string;
  task_type: TaskType;
  parent_task_id: string | null;
  project_id: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  mandatory: number;
  category: string;
  tags_json: string;
  due_date: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  reminder_at: string | null;
  recurrence_rule: string | null;
  estimated_minutes: number | null;
  is_sample: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskDependency {
  id: string;
  task_id: string;
  prerequisite_task_id: string;
}

export interface TaskSession {
  id: string;
  task_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  notes: string;
}

export interface Habit {
  id: string;
  title: string;
  description: string;
  frequency: 'daily' | 'weekly';
  tracking_type: 'checkbox' | 'quantity' | 'duration';
  target_value: number;
  unit: string;
  mandatory: number;
  category: string;
  is_sample: number;
  archived: number;
  created_at: string;
}

export interface HabitLog {
  id: string;
  habit_id: string;
  log_date: string;
  value: number;
  completed: number;
  notes: string;
  created_at: string;
}

export interface WeeklyTemplateBlock {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  title: string;
  module: ScoreCategory | 'general';
  mandatory: number;
  linked_entity_type: string | null;
  linked_entity_id: string | null;
}

export interface DailyScheduleException {
  id: string;
  exception_date: string;
  template_block_id: string | null;
  action: 'override' | 'skip' | 'add';
  title: string | null;
  start_time: string | null;
  end_time: string | null;
  module: string | null;
  mandatory: number | null;
}

export interface ActiveTimer {
  id: string;
  entity_type: 'task' | 'book' | 'study_topic' | 'english' | 'workout';
  entity_id: string;
  entity_title: string;
  status: 'running' | 'paused';
  started_at: string;
  last_resumed_at: string;
  accumulated_seconds: number;
  meta_json: string;
}

export interface LearningPath {
  id: string;
  title: string;
  description: string;
  target_hours: number | null;
  is_sample: number;
  created_at: string;
}

export interface Course {
  id: string;
  learning_path_id: string | null;
  title: string;
  provider: string;
  description: string;
  planned_hours: number | null;
  is_sample: number;
  created_at: string;
}

export interface CourseModule {
  id: string;
  course_id: string;
  title: string;
  sort_order: number;
}

export type TopicStatus = 'not_started' | 'in_progress' | 'completed' | 'needs_revision';

export interface StudyTopic {
  id: string;
  module_id: string;
  course_id: string;
  title: string;
  topic_kind: 'lesson' | 'lab' | 'assignment';
  status: TopicStatus;
  study_seconds: number;
  planned_minutes: number | null;
  last_studied_at: string | null;
  revision_count: number;
  next_review_date: string | null;
  ease_factor: number;
  interval_days: number;
  created_at: string;
}

export interface LearningResource {
  id: string;
  course_id: string | null;
  topic_id: string | null;
  title: string;
  resource_type: 'youtube' | 'udemy' | 'coursera' | 'website' | 'pdf' | 'local_file' | 'lab' | 'note';
  url_or_path: string;
  created_at: string;
}

export interface TopicNote {
  id: string;
  topic_id: string;
  section_type: 'explanation' | 'commands' | 'config' | 'troubleshooting' | 'interview' | 'general';
  title: string;
  content: string;
  code_snippet: string | null;
  attachment_path: string | null;
  updated_at: string;
}

export interface StudySession {
  id: string;
  topic_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  notes: string;
}

export interface Assessment {
  id: string;
  course_id: string;
  title: string;
  score: number;
  max_score: number;
  attempt_number: number;
  taken_at: string;
  notes: string;
}

export type EnglishSkill = 'speaking' | 'listening' | 'reading' | 'writing' | 'vocabulary' | 'grammar';
export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export interface VocabularyItem {
  id: string;
  word: string;
  meaning: string;
  part_of_speech: string;
  example: string;
  tags: string;
  repetitions: number;
  interval_days: number;
  ease_factor: number;
  next_review_date: string;
  mastered: number;
  is_sample: number;
  created_at: string;
}

export interface SpeakingRecording {
  id: string;
  topic: string;
  audio_path: string;
  duration_seconds: number;
  mistake_notes: string;
  transcript: string | null;
  ai_feedback: string | null;
  created_at: string;
}

export interface CEFRAssessment {
  id: string;
  assessed_at: string;
  overall_level: CEFRLevel;
  speaking: CEFRLevel;
  listening: CEFRLevel;
  reading: CEFRLevel;
  writing: CEFRLevel;
  vocabulary: CEFRLevel;
  grammar: CEFRLevel;
  notes: string;
}

export interface EnglishResource {
  id: string;
  title: string;
  resource_type: 'youtube' | 'podcast' | 'website' | 'pdf' | 'course' | 'movie_series' | 'link';
  url_or_path: string;
  skills_json: string;
  notes: string;
  created_at: string;
}

export interface WritingEntry {
  id: string;
  title: string;
  prompt: string;
  content: string;
  word_count: number;
  status: 'draft' | 'revised' | 'final';
  updated_at: string;
}

export interface EnglishDailyPlanItem {
  id: string;
  skill: EnglishSkill;
  title: string;
  target_minutes: number;
  completed_today: number;
  last_completed_date: string | null;
}

export interface WorkoutCategory {
  id: string;
  name: string;
  is_custom: number;
}

export interface Exercise {
  id: string;
  category_id: string;
  name: string;
  instructions: string;
  is_custom: number;
}

export interface WorkoutPlan {
  id: string;
  title: string;
  goal_type: string;
  category_id: string;
  exercises_json: string;
  created_at: string;
}

export interface WorkoutSession {
  id: string;
  plan_id: string | null;
  title: string;
  category_name: string;
  session_date: string;
  duration_minutes: number;
  estimated_calories: number | null;
  notes: string;
  is_sample: number;
  created_at: string;
}

export interface WorkoutSet {
  id: string;
  session_id: string;
  exercise_name: string;
  set_number: number;
  reps: number;
  weight_kg: number;
  is_pr: number;
}

export interface BodyMeasurement {
  id: string;
  measured_at: string;
  weight_kg: number | null;
  waist_cm: number | null;
  chest_cm: number | null;
  arm_cm: number | null;
  body_fat_pct: number | null;
  photo_path: string | null;
  notes: string;
}

export interface NutritionRecoveryLog {
  id: string;
  log_date: string;
  water_ml: number;
  meals_summary: string;
  sleep_hours: number | null;
  energy_level: number | null;
  is_rest_day: number;
  notes: string;
}

export type GoalArea = 'Personal' | 'Career' | 'Education' | 'Health' | 'Financial' | 'Social' | string;
export type GoalHorizon = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'long_term';

export interface Goal {
  id: string;
  parent_goal_id: string | null;
  title: string;
  description: string;
  area: GoalArea;
  horizon: GoalHorizon;
  start_date: string;
  target_date: string;
  status: 'active' | 'completed' | 'paused' | 'archived';
  manual_progress_override: number | null;
  is_sample: number;
  created_at: string;
  updated_at: string;
}

export interface GoalMilestone {
  id: string;
  goal_id: string;
  title: string;
  due_date: string | null;
  completed: number;
  completed_at: string | null;
  sort_order: number;
}

export interface GoalLink {
  id: string;
  goal_id: string;
  entity_type: 'task' | 'habit' | 'course' | 'topic' | 'book' | 'english' | 'workout';
  entity_id: string;
  entity_title: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  category: string;
  severity: 'info' | 'warning' | 'urgent';
  link_section: string | null;
  is_read: number;
  created_at: string;
}

export interface NowNextCandidate {
  id: string;
  sourceType: 'task' | 'schedule' | 'book' | 'study' | 'english' | 'habit';
  sourceId: string;
  title: string;
  subtitle: string;
  category: ScoreCategory | 'general';
  mandatory: boolean;
  priorityScore: number;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  blocked: boolean;
  blockedReason?: string;
}
