import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Check,
  ChevronRight,
  Flame,
  FolderKanban,
  ListTodo,
  Play,
  Plus,
  Search,
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
  SegmentedTabs,
  inputCls,
  labelCls,
} from '../components/ui/Primitives.tsx';
import type { Task, TaskPriority, TaskStatus, TaskType } from '../shared/types.ts';

export function TasksHabitsView({ onTimersChanged }: { onTimersChanged: () => void }) {
  const [tab, setTab] = useState<'list' | 'kanban' | 'calendar' | 'projects' | 'habits'>('list');
  const [tasks, setTasks] = useState<Array<Task & { blockedBy: string[]; isOverdue: boolean }>>([]);
  const [habits, setHabits] = useState<any[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [newHabitOpen, setNewHabitOpen] = useState(false);
  const [expandedSubtasks, setExpandedSubtasks] = useState<Record<string, boolean>>({});
  const [subtaskDraft, setSubtaskDraft] = useState<Record<string, string>>({});

  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    task_type: 'one_time' as TaskType,
    project_id: '',
    priority: 'medium' as TaskPriority,
    mandatory: true,
    category: 'General',
    tags: '',
    due_date: new Date().toISOString().slice(0, 10),
    scheduled_start: '',
    scheduled_end: '',
    reminder_at: '',
    recurrence_rule: '',
    estimated_minutes: '',
    prerequisite_ids: [] as string[],
  });

  const [habitForm, setHabitForm] = useState({
    title: '',
    description: '',
    frequency: 'daily',
    tracking_type: 'checkbox',
    target_value: '1',
    unit: 'times',
    mandatory: false,
    category: 'Health',
  });

  async function loadAll() {
    setLoading(true);
    try {
      const [tRes, hRes, cRes] = await Promise.all([
        api.get<{ tasks: any[] }>('/api/tasks'),
        api.get<{ habits: any[] }>('/api/tasks/habits/all'),
        api.get<{ events: any[] }>('/api/dashboard/calendar'),
      ]);
      setTasks(tRes.tasks);
      setHabits(hRes.habits);
      setCalendarEvents(cRes.events);
    } catch (e: any) {
      setError(e.message || 'Failed to load tasks & habits');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!taskForm.title.trim()) return;
    try {
      await api.post('/api/tasks', {
        ...taskForm,
        project_id: taskForm.project_id || null,
        tags: taskForm.tags
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        recurrence_rule: taskForm.task_type === 'recurring' ? taskForm.recurrence_rule || 'daily' : null,
        estimated_minutes: taskForm.estimated_minutes ? Number(taskForm.estimated_minutes) : null,
      });
      setNewTaskOpen(false);
      setTaskForm({
        ...taskForm,
        title: '',
        description: '',
        prerequisite_ids: [],
      });
      loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function updateTaskStatus(taskId: string, status: TaskStatus) {
    setError('');
    try {
      await api.put(`/api/tasks/${taskId}`, { status });
      loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function addSubtask(parentId: string) {
    const title = subtaskDraft[parentId]?.trim();
    if (!title) return;
    await api.post('/api/tasks', {
      title,
      parent_task_id: parentId,
      priority: 'medium',
      mandatory: false,
    });
    setSubtaskDraft({ ...subtaskDraft, [parentId]: '' });
    loadAll();
  }

  async function createHabit(e: React.FormEvent) {
    e.preventDefault();
    if (!habitForm.title.trim()) return;
    await api.post('/api/tasks/habits', {
      ...habitForm,
      target_value: Number(habitForm.target_value || 1),
    });
    setNewHabitOpen(false);
    setHabitForm({
      title: '',
      description: '',
      frequency: 'daily',
      tracking_type: 'checkbox',
      target_value: '1',
      unit: 'times',
      mandatory: false,
      category: 'Health',
    });
    loadAll();
  }

  const topLevelTasks = tasks.filter((t) => t.parent_task_id === null && t.task_type !== 'project');
  const projects = tasks.filter((t) => t.task_type === 'project');

  const filteredTasks = topLevelTasks.filter((t) => {
    if (statusFilter === 'active' && (t.status === 'completed' || t.status === 'cancelled')) return false;
    if (statusFilter === 'completed' && t.status !== 'completed') return false;
    if (statusFilter === 'overdue' && !t.isOverdue) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return t.title.toLowerCase().includes(q) || t.category.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Tasks & Habits"
        subtitle="Manage tasks, unlimited subtasks, dependencies, projects, shared calendar, and habit streaks."
        actions={
          <>
            <Button onClick={() => setNewHabitOpen(true)}>
              <Plus className="w-4 h-4" />
              New Habit
            </Button>
            <Button variant="primary" onClick={() => setNewTaskOpen(true)}>
              <Plus className="w-4 h-4" />
              New Task / Project
            </Button>
          </>
        }
      />

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-auto underline cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'list', label: 'Task List', count: topLevelTasks.length },
            { id: 'kanban', label: 'Kanban Board' },
            { id: 'projects', label: 'Projects', count: projects.length },
            { id: 'calendar', label: 'Shared Calendar' },
            { id: 'habits', label: 'Habits', count: habits.length },
          ]}
        />
        {tab === 'list' && (
          <div className="flex items-center gap-2">
            <select
              className={`${inputCls} w-auto`}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="active">Active</option>
              <option value="overdue">Overdue Only</option>
              <option value="completed">Completed</option>
              <option value="all">All</option>
            </select>
            <div className="relative w-56">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                className={`${inputCls} pl-9`}
                placeholder="Search tasks..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <LoadingRows count={5} />
      ) : tab === 'list' ? (
        filteredTasks.length === 0 ? (
          <EmptyState
            icon={<ListTodo className="w-8 h-8" />}
            title="No tasks match this filter"
            description="Create a one-time, recurring, scheduled, or project task to organize your day."
            action={
              <Button variant="primary" onClick={() => setNewTaskOpen(true)}>
                Create Task
              </Button>
            }
          />
        ) : (
          <Card padding="p-0" className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredTasks.map((t) => {
              const subtasks = tasks.filter((st) => st.parent_task_id === t.id);
              const isExpanded = Boolean(expandedSubtasks[t.id]);
              return (
                <div key={t.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <button
                        onClick={() => updateTaskStatus(t.id, t.status === 'completed' ? 'todo' : 'completed')}
                        className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 cursor-pointer ${
                          t.status === 'completed'
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'border-slate-300 dark:border-slate-600'
                        }`}
                      >
                        {t.status === 'completed' && <Check className="w-3 h-3" />}
                      </button>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-sm font-medium ${
                              t.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-900 dark:text-slate-100'
                            }`}
                          >
                            {t.title}
                          </span>
                          {t.isOverdue && (
                            <span className="text-xs font-medium text-red-600 dark:text-red-400">
                              Overdue
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {t.category} · {t.priority} · {t.task_type.replace('_', ' ')}
                          {t.due_date ? ` · Due ${t.due_date}` : ''}
                          {t.recurrence_rule ? ` · Repeats ${t.recurrence_rule}` : ''}
                          {t.blockedBy.length > 0 ? ` · Blocked by: ${t.blockedBy.join(', ')}` : ''}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        className={`${inputCls} w-auto py-1 text-xs`}
                        value={t.status}
                        onChange={(e) => updateTaskStatus(t.id, e.target.value as TaskStatus)}
                      >
                        <option value="todo">To Do</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                        <option value="on_hold">On Hold</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                      <Button
                        size="sm"
                        onClick={async () => {
                          await api.post('/api/system/timers/start', {
                            entity_type: 'task',
                            entity_id: t.id,
                            entity_title: t.title,
                          });
                          onTimersChanged();
                        }}
                      >
                        <Play className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setExpandedSubtasks({ ...expandedSubtasks, [t.id]: !isExpanded })}
                      >
                        Subtasks ({subtasks.length})
                        <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      </Button>
                      <button
                        onClick={async () => {
                          await api.del(`/api/tasks/${t.id}`);
                          loadAll();
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pl-7 space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                      {subtasks.map((st) => (
                        <div key={st.id} className="flex items-center justify-between text-xs">
                          <button
                            onClick={() => updateTaskStatus(st.id, st.status === 'completed' ? 'todo' : 'completed')}
                            className="flex items-center gap-2 cursor-pointer"
                          >
                            <span
                              className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                                st.status === 'completed'
                                  ? 'bg-emerald-600 border-emerald-600 text-white'
                                  : 'border-slate-300 dark:border-slate-600'
                              }`}
                            >
                              {st.status === 'completed' && <Check className="w-2.5 h-2.5" />}
                            </span>
                            <span className={st.status === 'completed' ? 'line-through text-slate-400' : ''}>
                              {st.title}
                            </span>
                          </button>
                          <button
                            onClick={async () => {
                              await api.del(`/api/tasks/${st.id}`);
                              loadAll();
                            }}
                            className="text-slate-400 hover:text-red-600 cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <input
                          className={`${inputCls} py-1 text-xs`}
                          placeholder="Add subtask..."
                          value={subtaskDraft[t.id] || ''}
                          onChange={(e) => setSubtaskDraft({ ...subtaskDraft, [t.id]: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addSubtask(t.id);
                            }
                          }}
                        />
                        <Button size="sm" onClick={() => addSubtask(t.id)}>
                          Add
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </Card>
        )
      ) : tab === 'kanban' ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {(['todo', 'in_progress', 'on_hold', 'completed'] as TaskStatus[]).map((col) => {
            const colTasks = topLevelTasks.filter((t) => t.status === col);
            return (
              <Card key={col} padding="p-3.5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold capitalize text-slate-700 dark:text-slate-200">
                    {col.replace('_', ' ')}
                  </span>
                  <span className="font-mono text-xs text-slate-400">{colTasks.length}</span>
                </div>
                <div className="space-y-2.5">
                  {colTasks.map((t) => (
                    <div
                      key={t.id}
                      className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-2"
                    >
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{t.title}</div>
                      <div className="text-xs text-slate-500">
                        {t.priority} {t.due_date ? `· ${t.due_date}` : ''}
                      </div>
                      <select
                        className={`${inputCls} py-1 text-xs`}
                        value={t.status}
                        onChange={(e) => updateTaskStatus(t.id, e.target.value as TaskStatus)}
                      >
                        <option value="todo">To Do</option>
                        <option value="in_progress">In Progress</option>
                        <option value="on_hold">On Hold</option>
                        <option value="completed">Completed</option>
                      </select>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      ) : tab === 'projects' ? (
        projects.length === 0 ? (
          <EmptyState
            icon={<FolderKanban className="w-8 h-8" />}
            title="No projects created yet"
            description="Create a task with type 'Project' to group child tasks and track aggregate project progress."
            action={
              <Button
                variant="primary"
                onClick={() => {
                  setTaskForm({ ...taskForm, task_type: 'project' });
                  setNewTaskOpen(true);
                }}
              >
                New Project
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {projects.map((p) => {
              const children = topLevelTasks.filter((t) => t.project_id === p.id);
              const doneCount = children.filter((c) => c.status === 'completed').length;
              const pct = children.length > 0 ? Math.round((doneCount / children.length) * 100) : 0;
              return (
                <Card key={p.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{p.title}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">{p.description || p.category}</p>
                    </div>
                    <span className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
                      {doneCount}/{children.length} tasks ({pct}%)
                    </span>
                  </div>
                  <div className="mt-3">
                    <ProgressBar value={pct} />
                  </div>
                  <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                    {children.map((c) => (
                      <div key={c.id} className="py-2 flex items-center justify-between text-xs">
                        <span className={c.status === 'completed' ? 'line-through text-slate-400' : ''}>{c.title}</span>
                        <span className="text-slate-500">{c.status.replace('_', ' ')}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        )
      ) : tab === 'calendar' ? (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold">Shared Cross-Module Schedule</h3>
          </div>
          {calendarEvents.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No scheduled dates across tasks, reading, study, goals, or workouts yet.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {calendarEvents
                .sort((a, b) => a.date.localeCompare(b.date))
                .map((ev) => (
                  <div key={ev.id} className="py-2.5 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs tabular-nums text-slate-500 w-24 shrink-0">{ev.date}</span>
                      <span className={ev.done ? 'line-through text-slate-400' : 'text-slate-900 dark:text-slate-100'}>
                        {ev.title}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500">
                      {ev.module} · {ev.meta}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </Card>
      ) : (
        habits.length === 0 ? (
          <EmptyState
            icon={<Flame className="w-8 h-8" />}
            title="No habits tracked yet"
            description="Create daily or weekly habits tracked by checkbox, quantity, or duration. Missed optional habits never penalize your score."
            action={
              <Button variant="primary" onClick={() => setNewHabitOpen(true)}>
                Create Habit
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {habits.map((h) => {
              const done = h.todayLog?.completed === 1;
              return (
                <Card key={h.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{h.title}</h3>
                      <p className="text-xs text-slate-500">
                        {h.frequency} · {h.tracking_type} ({h.target_value} {h.unit}) · {h.mandatory ? 'Mandatory' : 'Optional'}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                        {h.streak}d streak
                      </div>
                    </div>
                  </div>

                  {/* 14-day recent grid */}
                  <div className="mt-4 flex items-center gap-1">
                    {Array.from({ length: 14 }).map((_, idx) => {
                      const d = new Date();
                      d.setDate(d.getDate() - (13 - idx));
                      const dStr = d.toISOString().slice(0, 10);
                      const log = h.recentLogs?.find((l: any) => l.log_date === dStr);
                      return (
                        <div
                          key={dStr}
                          title={`${dStr}: ${log?.completed ? 'Completed' : 'Not logged'}`}
                          className={`h-4 flex-1 rounded-xs ${
                            log?.completed === 1
                              ? 'bg-emerald-500 dark:bg-emerald-600'
                              : 'bg-slate-100 dark:bg-slate-800'
                          }`}
                        />
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <Button
                      size="sm"
                      variant={done ? 'primary' : 'secondary'}
                      onClick={async () => {
                        await api.post(`/api/tasks/habits/${h.id}/log`, {
                          completed: !done,
                          value: !done ? h.target_value : 0,
                        });
                        loadAll();
                      }}
                    >
                      {done ? 'Completed Today' : 'Mark Done Today'}
                    </Button>
                    <button
                      onClick={async () => {
                        await api.del(`/api/tasks/habits/${h.id}`);
                        loadAll();
                      }}
                      className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        )
      )}

      {/* New Task / Project Modal */}
      <Modal open={newTaskOpen} onClose={() => setNewTaskOpen(false)} title="Create Task or Project">
        <form onSubmit={createTask} className="space-y-4">
          <div>
            <label className={labelCls}>Title *</label>
            <input
              required
              className={inputCls}
              value={taskForm.title}
              onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Type</label>
              <select
                className={inputCls}
                value={taskForm.task_type}
                onChange={(e) => setTaskForm({ ...taskForm, task_type: e.target.value as TaskType })}
              >
                <option value="one_time">One-time</option>
                <option value="scheduled">Scheduled</option>
                <option value="recurring">Recurring</option>
                <option value="quick">Quick Task</option>
                <option value="project">Project</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Priority</label>
              <select
                className={inputCls}
                value={taskForm.priority}
                onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value as TaskPriority })}
              >
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Category</label>
              <input
                className={inputCls}
                value={taskForm.category}
                onChange={(e) => setTaskForm({ ...taskForm, category: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Due Date</label>
              <input
                type="date"
                className={inputCls}
                value={taskForm.due_date}
                onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })}
              />
            </div>
            {taskForm.task_type === 'recurring' ? (
              <div>
                <label className={labelCls}>Recurrence Rule</label>
                <select
                  className={inputCls}
                  value={taskForm.recurrence_rule || 'daily'}
                  onChange={(e) => setTaskForm({ ...taskForm, recurrence_rule: e.target.value })}
                >
                  <option value="daily">Daily</option>
                  <option value="weekdays">Weekdays (Mon–Fri)</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
            ) : (
              <div>
                <label className={labelCls}>Parent Project (optional)</label>
                <select
                  className={inputCls}
                  value={taskForm.project_id}
                  onChange={(e) => setTaskForm({ ...taskForm, project_id: e.target.value })}
                >
                  <option value="">None</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {topLevelTasks.length > 0 && taskForm.task_type !== 'project' && (
            <div>
              <label className={labelCls}>Prerequisite Task (Dependency — blocks start until done)</label>
              <select
                className={inputCls}
                value={taskForm.prerequisite_ids[0] || ''}
                onChange={(e) =>
                  setTaskForm({ ...taskForm, prerequisite_ids: e.target.value ? [e.target.value] : [] })
                }
              >
                <option value="">No prerequisite</option>
                {topLevelTasks
                  .filter((x) => x.status !== 'completed')
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.title}
                    </option>
                  ))}
              </select>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={taskForm.mandatory}
              onChange={(e) => setTaskForm({ ...taskForm, mandatory: e.target.checked })}
            />
            Mandatory activity (affects Daily Score if left incomplete)
          </label>

          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => setNewTaskOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save
            </Button>
          </div>
        </form>
      </Modal>

      {/* New Habit Modal */}
      <Modal open={newHabitOpen} onClose={() => setNewHabitOpen(false)} title="Create Habit">
        <form onSubmit={createHabit} className="space-y-4">
          <div>
            <label className={labelCls}>Habit Title *</label>
            <input
              required
              className={inputCls}
              value={habitForm.title}
              onChange={(e) => setHabitForm({ ...habitForm, title: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Frequency</label>
              <select
                className={inputCls}
                value={habitForm.frequency}
                onChange={(e) => setHabitForm({ ...habitForm, frequency: e.target.value })}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Tracking Type</label>
              <select
                className={inputCls}
                value={habitForm.tracking_type}
                onChange={(e) => setHabitForm({ ...habitForm, tracking_type: e.target.value })}
              >
                <option value="checkbox">Checkbox</option>
                <option value="quantity">Quantity</option>
                <option value="duration">Duration</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Target Value</label>
              <input
                type="number"
                min={1}
                className={inputCls}
                value={habitForm.target_value}
                onChange={(e) => setHabitForm({ ...habitForm, target_value: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>Unit</label>
              <input
                className={inputCls}
                value={habitForm.unit}
                onChange={(e) => setHabitForm({ ...habitForm, unit: e.target.value })}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={habitForm.mandatory}
              onChange={(e) => setHabitForm({ ...habitForm, mandatory: e.target.checked })}
            />
            Mandatory habit
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => setNewHabitOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Create Habit
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
