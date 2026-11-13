import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Info,
  Play,
  Plus,
  SkipForward,
  Trash2,
} from 'lucide-react';
import { api } from '../lib/api.ts';
import {
  Button,
  Card,
  EmptyState,
  LoadingRows,
  Modal,
  ProgressBar,
  SectionHeader,
  inputCls,
  labelCls,
} from '../components/ui/Primitives.tsx';
import type { NowNextCandidate, Task } from '../shared/types.ts';
import type { DailyScoreResult } from '../shared/logic.ts';

interface DashboardData {
  date: string;
  nowTime: string;
  settings: any;
  dailyScore: DailyScoreResult;
  nowNext: {
    now: NowNextCandidate | null;
    next: NowNextCandidate[];
    skipped: NowNextCandidate[];
  };
  todaysTasks: Task[];
  overdueTasks: Task[];
  habits: Array<any>;
  todayBlocks: Array<any>;
  readingNow: any;
  readingMinutesToday: number;
  dueTopics: Array<any>;
  englishPlan: Array<any>;
  workoutToday: Array<any>;
  dueReminders: Task[];
}

export function HomeView({
  onNavigate,
  onTimersChanged,
  refreshKey,
}: {
  onNavigate: (section: string) => void;
  onTimersChanged: () => void;
  refreshKey: number;
}) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [scoreDrawerOpen, setScoreDrawerOpen] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [weeklyBlocks, setWeeklyBlocks] = useState<any[]>([]);
  const [newBlock, setNewBlock] = useState({
    day_of_week: new Date().getDay(),
    start_time: '09:00',
    end_time: '10:00',
    title: '',
    module: 'study',
    mandatory: true,
  });
  const [rescheduleTarget, setRescheduleTarget] = useState<{ id: string; date: string } | null>(null);

  async function load() {
    try {
      setError('');
      const res = await api.get<DashboardData>('/api/dashboard');
      setData(res);
    } catch (e: any) {
      setError(e.message || 'Failed to load daily dashboard');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [refreshKey]);

  async function openTemplateEditor() {
    const res = await api.get<{ blocks: any[] }>('/api/dashboard/weekly-blocks');
    setWeeklyBlocks(res.blocks);
    setTemplateModalOpen(true);
  }

  async function addWeeklyBlock(e: React.FormEvent) {
    e.preventDefault();
    if (!newBlock.title.trim()) return;
    await api.post('/api/dashboard/weekly-blocks', newBlock);
    setNewBlock({ ...newBlock, title: '' });
    const res = await api.get<{ blocks: any[] }>('/api/dashboard/weekly-blocks');
    setWeeklyBlocks(res.blocks);
    load();
  }

  async function deleteWeeklyBlock(id: string) {
    await api.del(`/api/dashboard/weekly-blocks/${id}`);
    setWeeklyBlocks((prev) => prev.filter((b) => b.id !== id));
    load();
  }

  async function completeCandidate(c: NowNextCandidate) {
    if (c.sourceType === 'task') {
      await api.put(`/api/tasks/${c.sourceId}`, { status: 'completed' });
    } else if (c.sourceType === 'schedule') {
      await api.post('/api/dashboard/now-next', {
        date: data?.date,
        action: 'complete_block',
        candidateId: c.id,
      });
    } else if (c.sourceType === 'english') {
      await api.post(`/api/english/plan/${c.sourceId}/toggle`);
    } else if (c.sourceType === 'book') {
      onNavigate('books');
      return;
    } else if (c.sourceType === 'study') {
      onNavigate('study');
      return;
    }
    await api.post('/api/dashboard/now-next', {
      date: data?.date,
      action: 'clear_manual_now',
    });
    load();
  }

  async function skipCandidate(c: NowNextCandidate) {
    await api.post('/api/dashboard/now-next', {
      date: data?.date,
      action: 'skip',
      candidateId: c.id,
    });
    load();
  }

  async function setAsNow(c: NowNextCandidate) {
    await api.post('/api/dashboard/now-next', {
      date: data?.date,
      action: 'set_now',
      candidateId: c.id,
    });
    load();
  }

  async function moveNextItem(index: number, delta: number) {
    if (!data) return;
    const arr = [...data.nowNext.next];
    const targetIdx = index + delta;
    if (targetIdx < 0 || targetIdx >= arr.length) return;
    const [moved] = arr.splice(index, 1);
    arr.splice(targetIdx, 0, moved);
    await api.post('/api/dashboard/now-next', {
      date: data.date,
      action: 'reorder_next',
      nextOrderIds: arr.map((x) => x.id),
    });
    load();
  }

  async function startTimerForCandidate(c: NowNextCandidate) {
    const typeMap: Record<string, string> = {
      task: 'task',
      book: 'book',
      study: 'study_topic',
      english: 'english',
    };
    const entityType = typeMap[c.sourceType] ?? 'task';
    await api.post('/api/system/timers/start', {
      entity_type: entityType,
      entity_id: c.sourceId,
      entity_title: c.title,
    });
    onTimersChanged();
  }

  async function handleOverdueAction(taskId: string, action: 'carry_forward' | 'skip' | 'reschedule', newDate?: string) {
    await api.post(`/api/tasks/${taskId}/overdue-action`, { action, new_date: newDate });
    setRescheduleTarget(null);
    load();
  }

  async function toggleHabit(h: any) {
    const done = h.todayLog?.completed === 1;
    await api.post(`/api/tasks/habits/${h.id}/log`, {
      log_date: data?.date,
      completed: !done,
      value: !done ? h.target_value : 0,
    });
    load();
  }

  async function updateHabitValue(h: any, val: number) {
    await api.post(`/api/tasks/habits/${h.id}/log`, {
      log_date: data?.date,
      value: val,
    });
    load();
  }

  if (loading) return <LoadingRows count={6} />;
  if (error || !data) {
    return (
      <EmptyState
        title="Could not load Daily Command Center"
        description={error || 'Unknown error'}
        action={<Button onClick={load}>Retry</Button>}
      />
    );
  }

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const formattedDate = new Date(`${data.date}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const { now, next, skipped } = data.nowNext;

  return (
    <div className="space-y-6">
      <SectionHeader
        title={`Daily Command Center`}
        subtitle={`${formattedDate} · ${data.settings?.profile_name || 'Learner'} · Focus window ${data.settings?.daily_focus_start}–${data.settings?.daily_focus_end}`}
        actions={
          <>
            <Button onClick={openTemplateEditor}>
              <Calendar className="w-4 h-4" />
              Weekly Template
            </Button>
            <Button onClick={() => setScoreDrawerOpen(true)}>
              <Info className="w-4 h-4" />
              Inspect Daily Score
            </Button>
          </>
        }
      />

      {/* Explicit Overdue Resolution Banner (never auto-moves tasks silently) */}
      {data.overdueTasks.length > 0 && (
        <Card className="border-amber-300 dark:border-amber-800/80 bg-amber-50/70 dark:bg-amber-950/20" padding="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {data.overdueTasks.length} Overdue Task{data.overdueTasks.length > 1 ? 's' : ''} — Choose how to handle
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Unfinished tasks stay overdue until you explicitly carry them forward, reschedule, or skip them.
              </p>
              <div className="mt-3 space-y-2">
                {data.overdueTasks.slice(0, 4).map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm py-1.5 border-t border-amber-200/70 dark:border-amber-900/50"
                  >
                    <div>
                      <span className="font-medium text-slate-900 dark:text-slate-100">{t.title}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400 ml-2 font-mono tabular-nums">
                        Due {t.due_date}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" onClick={() => handleOverdueAction(t.id, 'carry_forward')}>
                        Move to Today
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setRescheduleTarget({ id: t.id, date: data.date })}
                      >
                        Reschedule
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleOverdueAction(t.id, 'skip')}>
                        Skip
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Top Row: NOW Hero + Weighted Daily Score */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <Card className="lg:col-span-8 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                Now — Active Focus Recommendation
              </span>
              {now && (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {now.mandatory ? 'Mandatory' : 'Optional'} · {now.category}
                </span>
              )}
            </div>

            {now ? (
              <div className="mt-3">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-50 text-balance">
                  {now.title}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{now.subtitle}</p>
              </div>
            ) : (
              <div className="mt-3">
                <h2 className="text-lg font-medium text-slate-700 dark:text-slate-300">
                  No active focus item right now
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  All planned activities for today are completed or skipped, or nothing is scheduled yet. Use Quick Add to schedule a task or reading block.
                </p>
              </div>
            )}
          </div>

          {now && (
            <div className="flex flex-wrap items-center gap-2 mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
              <Button variant="primary" onClick={() => completeCandidate(now)}>
                <CheckCircle2 className="w-4 h-4" />
                Complete & Advance
              </Button>
              <Button onClick={() => startTimerForCandidate(now)}>
                <Play className="w-4 h-4" />
                Start Timer
              </Button>
              <Button variant="ghost" onClick={() => skipCandidate(now)}>
                <SkipForward className="w-4 h-4" />
                {now.mandatory ? 'Defer / Pick Alternative' : 'Skip (No Penalty)'}
              </Button>
            </div>
          )}
        </Card>

        <Card className="lg:col-span-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Weighted Daily Score
              </span>
              <button
                onClick={() => setScoreDrawerOpen(true)}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                Explain math
              </button>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-4xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-50">
                {data.dailyScore.score !== null ? `${data.dailyScore.score}%` : '—'}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {data.dailyScore.earnedPoints} / {data.dailyScore.possiblePoints} pts
              </span>
            </div>
            <div className="mt-3">
              <ProgressBar value={data.dailyScore.score ?? 0} />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 leading-relaxed">
              {data.dailyScore.explanation}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 text-xs">
            <div>
              <div className="text-slate-400">Mandatory</div>
              <div className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                {data.dailyScore.mandatoryCompleted}/{data.dailyScore.mandatoryTotal}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Reading</div>
              <div className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                {data.readingMinutesToday}m
              </div>
            </div>
            <div>
              <div className="text-slate-400">Due Reviews</div>
              <div className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                {data.dueTopics.length}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Middle Grid: NEXT Queue + Daily Schedule Blocks */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <Card className="lg:col-span-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Next Queue ({next.length})
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Reorder or promote to NOW
            </span>
          </div>
          {next.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">No queued items remaining for today.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {next.slice(0, 6).map((item, idx) => (
                <div key={item.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {item.title}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {item.subtitle} · {item.mandatory ? 'Mandatory' : 'Optional'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => moveNextItem(idx, -1)}
                      disabled={idx === 0}
                      title="Move up"
                      className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => moveNextItem(idx, 1)}
                      disabled={idx === next.length - 1}
                      title="Move down"
                      className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <Button size="sm" onClick={() => setAsNow(item)}>
                      Set NOW
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {skipped.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="text-xs font-medium text-slate-500 mb-2">
                Skipped today ({skipped.length})
              </div>
              <div className="flex flex-wrap gap-2">
                {skipped.map((s) => (
                  <button
                    key={s.id}
                    onClick={async () => {
                      await api.post('/api/dashboard/now-next', {
                        date: data.date,
                        action: 'unskip',
                        candidateId: s.id,
                      });
                      load();
                    }}
                    className="text-xs px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Restore: {s.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card className="lg:col-span-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Today’s Schedule & Routine Blocks
            </h3>
            <Button size="sm" variant="ghost" onClick={openTemplateEditor}>
              Edit Template
            </Button>
          </div>
          {data.todayBlocks.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">
              No weekly template blocks configured for {dayNames[new Date().getDay()]}. Click “Edit Template” to define your repeating schedule.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.todayBlocks.map((b) => (
                <div key={b.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                      {b.start_time}–{b.end_time}
                    </span>
                    <div className="min-w-0">
                      <div
                        className={`text-sm font-medium truncate ${
                          b.completed ? 'line-through text-slate-400' : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {b.title}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {b.module} · {b.mandatory ? 'Mandatory' : 'Optional'}
                      </div>
                    </div>
                  </div>
                  {!b.completed && (
                    <Button
                      size="sm"
                      onClick={async () => {
                        await api.post('/api/dashboard/now-next', {
                          date: data.date,
                          action: 'complete_block',
                          candidateId: `block:${b.id}`,
                        });
                        load();
                      }}
                    >
                      <Check className="w-3.5 h-3.5" />
                      Done
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Bottom Row: Today's Tasks, Habits, & Module Snapshots */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <Card className="lg:col-span-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Today’s Tasks ({data.todaysTasks.length})
            </h3>
            <button
              onClick={() => onNavigate('tasks')}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              Open Tasks →
            </button>
          </div>
          {data.todaysTasks.length === 0 ? (
            <p className="text-sm text-slate-500 py-3">No tasks due today.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.todaysTasks.map((t) => (
                <div key={t.id} className="py-2.5 flex items-center justify-between gap-2">
                  <button
                    onClick={async () => {
                      await api.put(`/api/tasks/${t.id}`, {
                        status: t.status === 'completed' ? 'todo' : 'completed',
                      });
                      load();
                    }}
                    className="flex items-center gap-2.5 text-left min-w-0 cursor-pointer"
                  >
                    <span
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                        t.status === 'completed'
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'border-slate-300 dark:border-slate-600'
                      }`}
                    >
                      {t.status === 'completed' && <Check className="w-3 h-3" />}
                    </span>
                    <span
                      className={`text-sm truncate ${
                        t.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      {t.title}
                    </span>
                  </button>
                  <span className="text-xs text-slate-500 shrink-0">
                    {t.priority} {t.mandatory ? '· Mandatory' : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="lg:col-span-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Habits Today ({data.habits.length})
            </h3>
            <button
              onClick={() => onNavigate('tasks')}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              Manage →
            </button>
          </div>
          {data.habits.length === 0 ? (
            <p className="text-sm text-slate-500 py-3">No habits tracked yet.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.habits.map((h) => {
                const done = h.todayLog?.completed === 1;
                const val = h.todayLog?.value ?? 0;
                return (
                  <div key={h.id} className="py-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {h.title}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {h.frequency} · {h.mandatory ? 'Mandatory' : 'Optional'}
                      </div>
                    </div>
                    {h.tracking_type === 'checkbox' ? (
                      <Button size="sm" variant={done ? 'primary' : 'secondary'} onClick={() => toggleHabit(h)}>
                        {done ? 'Done' : 'Check'}
                      </Button>
                    ) : (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
                          {val}/{h.target_value} {h.unit}
                        </span>
                        <Button
                          size="sm"
                          onClick={() =>
                            updateHabitValue(
                              h,
                              Math.min(h.target_value, val + Math.max(1, Math.round(h.target_value / 4)))
                            )
                          }
                        >
                          +
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="lg:col-span-3 flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
              Currently Reading
            </h3>
            {data.readingNow ? (
              <div className="space-y-2">
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {data.readingNow.title}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  Page {data.readingNow.current_page}
                  {data.readingNow.total_pages ? ` / ${data.readingNow.total_pages} (${data.readingNow.progress_percent}%)` : ''}
                </div>
                <ProgressBar value={data.readingNow.progress_percent || 0} />
                <Button size="sm" className="w-full mt-2" onClick={() => onNavigate('books')}>
                  <BookOpen className="w-3.5 h-3.5" />
                  Continue Reading
                </Button>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                No book set to NOW queue.{' '}
                <button onClick={() => onNavigate('books')} className="text-blue-600 hover:underline cursor-pointer">
                  Open Library
                </button>
              </p>
            )}
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">English Plan</span>
              <button onClick={() => onNavigate('english')} className="font-mono tabular-nums text-blue-600 hover:underline cursor-pointer">
                {data.englishPlan.filter((p) => p.completed_today === 1).length}/{data.englishPlan.length} done
              </button>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Workouts Today</span>
              <button onClick={() => onNavigate('fitness')} className="font-mono tabular-nums text-blue-600 hover:underline cursor-pointer">
                {data.workoutToday.length} logged
              </button>
            </div>
          </div>
        </Card>
      </div>

      {/* Daily Score Transparency Drawer/Modal */}
      <Modal
        open={scoreDrawerOpen}
        onClose={() => setScoreDrawerOpen(false)}
        title="Weighted Daily Score Breakdown"
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-600 dark:text-slate-300 space-y-1">
            <p className="font-semibold text-slate-900 dark:text-slate-100">How your score is calculated</p>
            <p>
              Each category uses your configured weights from Settings. Mandatory items count 100% of their category weight. Optional items count 50% when active, and skipping an optional item removes it from the denominator so it never penalizes you.
            </p>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.dailyScore.breakdown.map((b) => (
              <div key={b.id} className="py-2.5 flex items-center justify-between gap-4 text-sm">
                <div>
                  <div className="font-medium text-slate-900 dark:text-slate-100">{b.title}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {b.category} · {b.note}
                  </div>
                </div>
                <span className="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200 shrink-0">
                  +{b.earnedPoints} / {b.possiblePoints} pts
                </span>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      {/* Weekly Template Modal */}
      <Modal
        open={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        title="Weekly Repeating Schedule Template"
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          <form onSubmit={addWeeklyBlock} className="grid grid-cols-1 sm:grid-cols-6 gap-2 items-end">
            <div className="sm:col-span-2">
              <label className={labelCls}>Day</label>
              <select
                className={inputCls}
                value={newBlock.day_of_week}
                onChange={(e) => setNewBlock({ ...newBlock, day_of_week: Number(e.target.value) })}
              >
                {dayNames.map((d, idx) => (
                  <option key={d} value={idx}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Start</label>
              <input
                type="time"
                className={inputCls}
                value={newBlock.start_time}
                onChange={(e) => setNewBlock({ ...newBlock, start_time: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>End</label>
              <input
                type="time"
                className={inputCls}
                value={newBlock.end_time}
                onChange={(e) => setNewBlock({ ...newBlock, end_time: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Module</label>
              <select
                className={inputCls}
                value={newBlock.module}
                onChange={(e) => setNewBlock({ ...newBlock, module: e.target.value })}
              >
                <option value="study">Study</option>
                <option value="reading">Reading</option>
                <option value="english">English</option>
                <option value="tasks">Tasks</option>
                <option value="workout">Workout</option>
                <option value="general">General</option>
              </select>
            </div>
            <div className="sm:col-span-4">
              <label className={labelCls}>Activity Title</label>
              <input
                className={inputCls}
                placeholder="e.g., Morning Deep Study"
                value={newBlock.title}
                onChange={(e) => setNewBlock({ ...newBlock, title: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 pb-2">
              <input
                type="checkbox"
                checked={newBlock.mandatory}
                onChange={(e) => setNewBlock({ ...newBlock, mandatory: e.target.checked })}
              />
              Mandatory
            </label>
            <Button type="submit" variant="primary" size="sm">
              <Plus className="w-3.5 h-3.5" />
              Add
            </Button>
          </form>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
            {weeklyBlocks.map((b) => (
              <div key={b.id} className="py-2 flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium text-slate-900 dark:text-slate-100">{dayNames[b.day_of_week]}</span>
                  <span className="font-mono text-xs text-slate-500 mx-2">
                    {b.start_time}–{b.end_time}
                  </span>
                  <span>{b.title}</span>
                  <span className="text-xs text-slate-400 ml-2">
                    ({b.module}{b.mandatory ? ', mandatory' : ''})
                  </span>
                </div>
                <button
                  onClick={() => deleteWeeklyBlock(b.id)}
                  className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      {/* Reschedule Overdue Modal */}
      <Modal
        open={Boolean(rescheduleTarget)}
        onClose={() => setRescheduleTarget(null)}
        title="Reschedule Overdue Task"
      >
        {rescheduleTarget && (
          <div className="space-y-4">
            <div>
              <label className={labelCls}>New Due Date</label>
              <input
                type="date"
                className={inputCls}
                value={rescheduleTarget.date}
                onChange={(e) => setRescheduleTarget({ ...rescheduleTarget, date: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setRescheduleTarget(null)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={() => handleOverdueAction(rescheduleTarget.id, 'reschedule', rescheduleTarget.date)}
              >
                Save New Date
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
