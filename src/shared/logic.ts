import type {
  ActiveTimer,
  DailyScoreWeights,
  Goal,
  GoalMilestone,
  NowNextCandidate,
  ScoreCategory,
  Task,
  TaskDependency,
} from './types.ts';

export const DEFAULT_SCORE_WEIGHTS: DailyScoreWeights = {
  tasks: 30,
  habits: 20,
  reading: 15,
  study: 20,
  english: 10,
  workout: 5,
};

export interface ScoreItemInput {
  id: string;
  title: string;
  category: ScoreCategory;
  mandatory: boolean;
  status: 'pending' | 'completed' | 'skipped';
}

export interface ScoreBreakdownItem {
  id: string;
  title: string;
  category: ScoreCategory;
  mandatory: boolean;
  status: 'pending' | 'completed' | 'skipped';
  possiblePoints: number;
  earnedPoints: number;
  note: string;
}

export interface DailyScoreResult {
  score: number | null;
  earnedPoints: number;
  possiblePoints: number;
  mandatoryCompleted: number;
  mandatoryTotal: number;
  optionalCompleted: number;
  optionalSkipped: number;
  breakdown: ScoreBreakdownItem[];
  explanation: string;
}

export function parseScoreWeights(json: string | null | undefined): DailyScoreWeights {
  if (!json) return { ...DEFAULT_SCORE_WEIGHTS };
  try {
    const parsed = JSON.parse(json) as Partial<DailyScoreWeights>;
    return {
      tasks: Number(parsed.tasks ?? DEFAULT_SCORE_WEIGHTS.tasks),
      habits: Number(parsed.habits ?? DEFAULT_SCORE_WEIGHTS.habits),
      reading: Number(parsed.reading ?? DEFAULT_SCORE_WEIGHTS.reading),
      study: Number(parsed.study ?? DEFAULT_SCORE_WEIGHTS.study),
      english: Number(parsed.english ?? DEFAULT_SCORE_WEIGHTS.english),
      workout: Number(parsed.workout ?? DEFAULT_SCORE_WEIGHTS.workout),
    };
  } catch {
    return { ...DEFAULT_SCORE_WEIGHTS };
  }
}

export function calculateDailyScore(
  items: ScoreItemInput[],
  weights: DailyScoreWeights
): DailyScoreResult {
  let earnedPoints = 0;
  let possiblePoints = 0;
  let mandatoryCompleted = 0;
  let mandatoryTotal = 0;
  let optionalCompleted = 0;
  let optionalSkipped = 0;
  const breakdown: ScoreBreakdownItem[] = [];

  for (const item of items) {
    const catWeight = Math.max(0, weights[item.category] ?? 10);
    if (item.mandatory) {
      mandatoryTotal += 1;
      const itemPossible = catWeight;
      const itemEarned = item.status === 'completed' ? itemPossible : 0;
      if (item.status === 'completed') mandatoryCompleted += 1;
      possiblePoints += itemPossible;
      earnedPoints += itemEarned;
      breakdown.push({
        ...item,
        possiblePoints: itemPossible,
        earnedPoints: itemEarned,
        note:
          item.status === 'completed'
            ? 'Mandatory completed (+100% of weight)'
            : item.status === 'skipped'
              ? 'Mandatory skipped (counts against score)'
              : 'Mandatory pending',
      });
    } else {
      if (item.status === 'skipped') {
        optionalSkipped += 1;
        breakdown.push({
          ...item,
          possiblePoints: 0,
          earnedPoints: 0,
          note: 'Optional skipped (no penalty)',
        });
      } else {
        const itemPossible = Number((catWeight * 0.5).toFixed(2));
        const itemEarned = item.status === 'completed' ? itemPossible : 0;
        if (item.status === 'completed') optionalCompleted += 1;
        possiblePoints += itemPossible;
        earnedPoints += itemEarned;
        breakdown.push({
          ...item,
          possiblePoints: itemPossible,
          earnedPoints: itemEarned,
          note:
            item.status === 'completed'
              ? 'Optional completed (+50% category weight)'
              : 'Optional pending (+0.5x weight when done)',
        });
      }
    }
  }

  if (possiblePoints === 0) {
    return {
      score: null,
      earnedPoints: 0,
      possiblePoints: 0,
      mandatoryCompleted,
      mandatoryTotal,
      optionalCompleted,
      optionalSkipped,
      breakdown,
      explanation: 'No active mandatory or non-skipped optional items scheduled for today yet.',
    };
  }

  const score = Math.round((earnedPoints / possiblePoints) * 100);
  return {
    score,
    earnedPoints: Number(earnedPoints.toFixed(1)),
    possiblePoints: Number(possiblePoints.toFixed(1)),
    mandatoryCompleted,
    mandatoryTotal,
    optionalCompleted,
    optionalSkipped,
    breakdown,
    explanation: `Earned ${earnedPoints.toFixed(1)} of ${possiblePoints.toFixed(1)} weighted points (${mandatoryCompleted}/${mandatoryTotal} mandatory done, ${optionalSkipped} optional skipped without penalty).`,
  };
}

export function getNextRecurrenceDate(currentDateStr: string, rule: string): string {
  const base = new Date(`${currentDateStr}T12:00:00Z`);
  if (Number.isNaN(base.getTime())) {
    return currentDateStr;
  }

  const normalized = rule.trim().toLowerCase();
  if (normalized === 'daily') {
    base.setUTCDate(base.getUTCDate() + 1);
  } else if (normalized === 'weekdays') {
    do {
      base.setUTCDate(base.getUTCDate() + 1);
    } while (base.getUTCDay() === 0 || base.getUTCDay() === 6);
  } else if (normalized === 'weekly') {
    base.setUTCDate(base.getUTCDate() + 7);
  } else if (normalized === 'monthly') {
    base.setUTCMonth(base.getUTCMonth() + 1);
  } else if (normalized.startsWith('every:')) {
    const days = parseInt(normalized.split(':')[1] ?? '1', 10);
    base.setUTCDate(base.getUTCDate() + (Number.isFinite(days) && days > 0 ? days : 1));
  } else {
    base.setUTCDate(base.getUTCDate() + 1);
  }

  return base.toISOString().slice(0, 10);
}

export function findBlockedTasks(
  tasks: Task[],
  dependencies: TaskDependency[]
): Map<string, string[]> {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const blockedMap = new Map<string, string[]>();

  for (const dep of dependencies) {
    const prereq = taskMap.get(dep.prerequisite_task_id);
    if (prereq && prereq.status !== 'completed') {
      const existing = blockedMap.get(dep.task_id) ?? [];
      existing.push(prereq.title);
      blockedMap.set(dep.task_id, existing);
    }
  }
  return blockedMap;
}

export function findOverdueTasks(tasks: Task[], todayStr: string): Task[] {
  return tasks.filter(
    (t) =>
      t.due_date !== null &&
      t.due_date < todayStr &&
      (t.status === 'todo' || t.status === 'in_progress') &&
      t.parent_task_id === null
  );
}

export function computeNowNext(params: {
  candidates: NowNextCandidate[];
  currentTimeHHMM: string;
  manualNowId: string | null;
  nextOrderIds: string[];
  skippedIds: string[];
}): { now: NowNextCandidate | null; next: NowNextCandidate[]; skipped: NowNextCandidate[] } {
  const skippedSet = new Set(params.skippedIds);
  const eligible = params.candidates.filter((c) => !c.blocked && !skippedSet.has(c.id));
  const skipped = params.candidates.filter((c) => skippedSet.has(c.id));

  const scored = [...eligible].sort((a, b) => {
    const aActiveNow =
      a.scheduledStart && a.scheduledEnd
        ? params.currentTimeHHMM >= a.scheduledStart && params.currentTimeHHMM <= a.scheduledEnd
        : false;
    const bActiveNow =
      b.scheduledStart && b.scheduledEnd
        ? params.currentTimeHHMM >= b.scheduledStart && params.currentTimeHHMM <= b.scheduledEnd
        : false;

    if (aActiveNow !== bActiveNow) return aActiveNow ? -1 : 1;
    if (a.mandatory !== b.mandatory) return a.mandatory ? -1 : 1;
    return b.priorityScore - a.priorityScore;
  });

  let now: NowNextCandidate | null = null;
  if (params.manualNowId) {
    now = scored.find((c) => c.id === params.manualNowId) ?? null;
  }
  if (!now) {
    now = scored[0] ?? null;
  }

  const remaining = scored.filter((c) => c.id !== now?.id);
  const orderIndex = new Map(params.nextOrderIds.map((id, idx) => [id, idx]));
  remaining.sort((a, b) => {
    const ai = orderIndex.get(a.id);
    const bi = orderIndex.get(b.id);
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai !== undefined) return -1;
    if (bi !== undefined) return 1;
    return 0;
  });

  return { now, next: remaining, skipped };
}

export interface ReadingMetrics {
  progressPercent: number | null;
  remainingPages: number | null;
  suggestedPagesPerDay: number | null;
  averagePagesPerHour: number | null;
  hasUnknownPages: boolean;
}

export function calculateReadingMetrics(params: {
  totalPages: number | null;
  currentPage: number;
  targetFinishDate: string | null;
  todayStr: string;
  totalMinutesRead: number;
  totalPagesLogged: number;
  manualPercent?: number;
}): ReadingMetrics {
  const hasUnknownPages = params.totalPages === null || params.totalPages <= 0;
  const progressPercent = hasUnknownPages
    ? params.manualPercent && params.manualPercent > 0
      ? Math.min(100, Math.round(params.manualPercent))
      : null
    : Math.min(100, Math.round((params.currentPage / params.totalPages!) * 100));

  const remainingPages = hasUnknownPages
    ? null
    : Math.max(0, params.totalPages! - params.currentPage);

  let suggestedPagesPerDay: number | null = null;
  if (!hasUnknownPages && remainingPages !== null && remainingPages > 0 && params.targetFinishDate) {
    const startMs = new Date(`${params.todayStr}T00:00:00Z`).getTime();
    const endMs = new Date(`${params.targetFinishDate}T00:00:00Z`).getTime();
    const daysRemaining = Math.max(1, Math.ceil((endMs - startMs) / (1000 * 60 * 60 * 24)));
    suggestedPagesPerDay = Math.ceil(remainingPages / daysRemaining);
  }

  const averagePagesPerHour =
    params.totalMinutesRead >= 5 && params.totalPagesLogged > 0
      ? Number((params.totalPagesLogged / (params.totalMinutesRead / 60)).toFixed(1))
      : null;

  return {
    progressPercent,
    remainingPages,
    suggestedPagesPerDay,
    averagePagesPerHour,
    hasUnknownPages,
  };
}

export function calculateNextReviewSM2(params: {
  quality: number;
  repetitions: number;
  intervalDays: number;
  easeFactor: number;
  todayStr: string;
}): { repetitions: number; intervalDays: number; easeFactor: number; nextReviewDate: string } {
  const q = Math.max(1, Math.min(5, Math.round(params.quality)));
  let repetitions = params.repetitions;
  let intervalDays = params.intervalDays;
  let easeFactor = params.easeFactor;

  if (q < 3) {
    repetitions = 0;
    intervalDays = 1;
  } else {
    if (repetitions === 0) intervalDays = 1;
    else if (repetitions === 1) intervalDays = 6;
    else intervalDays = Math.round(intervalDays * easeFactor);
    repetitions += 1;
  }

  easeFactor = Math.max(1.3, Number((easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))).toFixed(2)));

  const d = new Date(`${params.todayStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + intervalDays);
  return {
    repetitions,
    intervalDays,
    easeFactor,
    nextReviewDate: d.toISOString().slice(0, 10),
  };
}

export function calculateGoalProgress(params: {
  goal: Goal;
  milestones: GoalMilestone[];
  childGoalsProgress: number[];
  linkedCompletionRatio: number | null;
}): number {
  if (params.goal.status === 'completed') return 100;
  if (params.goal.manual_progress_override !== null) {
    return Math.max(0, Math.min(100, Math.round(params.goal.manual_progress_override)));
  }

  const parts: number[] = [];
  if (params.milestones.length > 0) {
    const done = params.milestones.filter((m) => m.completed === 1).length;
    parts.push((done / params.milestones.length) * 100);
  }
  if (params.childGoalsProgress.length > 0) {
    const avgChild =
      params.childGoalsProgress.reduce((sum, p) => sum + p, 0) / params.childGoalsProgress.length;
    parts.push(avgChild);
  }
  if (params.linkedCompletionRatio !== null) {
    parts.push(params.linkedCompletionRatio * 100);
  }

  if (parts.length === 0) return 0;
  return Math.round(parts.reduce((s, p) => s + p, 0) / parts.length);
}

export interface GoalScheduleEvaluation {
  isBehind: boolean;
  elapsedPercent: number;
  actualPercent: number;
  suggestedTargetDate: string | null;
  recommendation: string | null;
}

export function evaluateGoalSchedule(params: {
  startDate: string;
  targetDate: string;
  todayStr: string;
  actualPercent: number;
  status: Goal['status'];
}): GoalScheduleEvaluation {
  if (params.status !== 'active' || params.actualPercent >= 100) {
    return {
      isBehind: false,
      elapsedPercent: 0,
      actualPercent: params.actualPercent,
      suggestedTargetDate: null,
      recommendation: null,
    };
  }

  const startMs = new Date(`${params.startDate}T00:00:00Z`).getTime();
  const targetMs = new Date(`${params.targetDate}T00:00:00Z`).getTime();
  const todayMs = new Date(`${params.todayStr}T00:00:00Z`).getTime();

  if (targetMs <= startMs) {
    return {
      isBehind: params.todayStr > params.targetDate,
      elapsedPercent: 100,
      actualPercent: params.actualPercent,
      suggestedTargetDate: params.todayStr > params.targetDate ? addDays(params.todayStr, 14) : null,
      recommendation:
        params.todayStr > params.targetDate
          ? 'Target date has passed. Propose extending target by 14 days and re-prioritizing linked tasks.'
          : null,
    };
  }

  const elapsedPercent = Math.max(
    0,
    Math.min(100, Math.round(((todayMs - startMs) / (targetMs - startMs)) * 100))
  );

  const isOverdue = params.todayStr > params.targetDate;
  const gap = elapsedPercent - params.actualPercent;
  const isBehind = isOverdue || gap >= 20;

  if (!isBehind) {
    return {
      isBehind: false,
      elapsedPercent,
      actualPercent: params.actualPercent,
      suggestedTargetDate: null,
      recommendation: null,
    };
  }

  const remainingPct = Math.max(10, 100 - params.actualPercent);
  const elapsedDays = Math.max(1, Math.round((todayMs - startMs) / (1000 * 60 * 60 * 24)));
  const ratePerDay = Math.max(0.5, params.actualPercent / elapsedDays);
  const neededDays = Math.min(180, Math.max(7, Math.ceil(remainingPct / ratePerDay)));
  const suggestedTargetDate = addDays(params.todayStr, neededDays);

  return {
    isBehind: true,
    elapsedPercent,
    actualPercent: params.actualPercent,
    suggestedTargetDate,
    recommendation: isOverdue
      ? `Goal is past target date (${params.targetDate}) at ${params.actualPercent}% progress. Suggested revised target: ${suggestedTargetDate}.`
      : `Elapsed time (${elapsedPercent}%) leads completion (${params.actualPercent}%) by ${gap}%. Suggested revised target: ${suggestedTargetDate}.`,
  };
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function computeElapsedSeconds(timer: ActiveTimer, nowMs: number = Date.now()): number {
  if (timer.status === 'paused') return timer.accumulated_seconds;
  const resumedMs = new Date(timer.last_resumed_at).getTime();
  if (Number.isNaN(resumedMs)) return timer.accumulated_seconds;
  const delta = Math.max(0, Math.floor((nowMs - resumedMs) / 1000));
  return timer.accumulated_seconds + delta;
}

export function formatDurationHMS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hrs > 0) return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  return `${pad(mins)}:${pad(secs)}`;
}
