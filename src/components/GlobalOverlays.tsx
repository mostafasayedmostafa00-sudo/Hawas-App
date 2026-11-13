import React, { useEffect, useState } from 'react';
import { Bell, Pause, Play, Plus, Search, Square, Trash2 } from 'lucide-react';
import { api } from '../lib/api.ts';
import { computeElapsedSeconds, formatDurationHMS } from '../shared/logic.ts';
import type { ActiveTimer, NotificationItem } from '../shared/types.ts';
import { Button, Modal, inputCls, labelCls } from './ui/Primitives.tsx';

export function PersistentTimerBanner({
  timers,
  onChanged,
}: {
  timers: ActiveTimer[];
  onChanged: () => void;
}) {
  const [tick, setTick] = useState(0);
  const [stoppingTimer, setStoppingTimer] = useState<ActiveTimer | null>(null);
  const [stopNotes, setStopNotes] = useState('');
  const [endPage, setEndPage] = useState('');

  useEffect(() => {
    if (timers.length === 0) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [timers.length]);

  if (timers.length === 0) return null;

  const active = timers[0];
  const elapsed = computeElapsedSeconds(active, Date.now() + tick * 0);

  async function togglePause() {
    if (active.status === 'running') {
      await api.post(`/api/system/timers/${active.id}/pause`);
    } else {
      await api.post(`/api/system/timers/${active.id}/resume`);
    }
    onChanged();
  }

  async function confirmStop(e: React.FormEvent) {
    e.preventDefault();
    if (!stoppingTimer) return;
    await api.post(`/api/system/timers/${stoppingTimer.id}/stop`, {
      notes: stopNotes,
      end_page: endPage ? Number(endPage) : undefined,
    });
    setStoppingTimer(null);
    setStopNotes('');
    setEndPage('');
    onChanged();
  }

  async function discardTimer() {
    await api.del(`/api/system/timers/${active.id}`);
    onChanged();
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 bg-blue-50 dark:bg-blue-950/40 border-b border-blue-200 dark:border-blue-900 text-sm">
        <div className="flex items-center gap-3">
          <span className="font-mono font-semibold tabular-nums text-blue-700 dark:text-blue-300 text-base">
            {formatDurationHMS(elapsed)}
          </span>
          <span className="text-slate-700 dark:text-slate-200 font-medium truncate max-w-md">
            {active.entity_title}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {active.entity_type.replace('_', ' ')} · {active.status === 'running' ? 'Running' : 'Paused'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={togglePause}>
            {active.status === 'running' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {active.status === 'running' ? 'Pause' : 'Resume'}
          </Button>
          <Button size="sm" variant="primary" onClick={() => setStoppingTimer(active)}>
            <Square className="w-3.5 h-3.5" />
            Finish & Log
          </Button>
          <Button size="sm" variant="ghost" onClick={discardTimer} title="Discard interrupted timer">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <Modal
        open={Boolean(stoppingTimer)}
        onClose={() => setStoppingTimer(null)}
        title={`Finish Session: ${stoppingTimer?.entity_title ?? ''}`}
      >
        <form onSubmit={confirmStop} className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Elapsed duration:{' '}
            <span className="font-mono font-semibold tabular-nums">
              {stoppingTimer ? formatDurationHMS(computeElapsedSeconds(stoppingTimer)) : '00:00'}
            </span>
          </p>
          {stoppingTimer?.entity_type === 'book' && (
            <div>
              <label className={labelCls}>Ending Page Number (optional)</label>
              <input
                type="number"
                min={0}
                className={inputCls}
                value={endPage}
                onChange={(e) => setEndPage(e.target.value)}
                placeholder="Enter current page reached"
              />
            </div>
          )}
          <div>
            <label className={labelCls}>Session Notes</label>
            <textarea
              className={inputCls}
              rows={3}
              value={stopNotes}
              onChange={(e) => setStopNotes(e.target.value)}
              placeholder="Key takeaways, progress made, or next step..."
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => setStoppingTimer(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save Session
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function GlobalSearchModal({
  open,
  onClose,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (section: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ type: string; section: string; id: string; title: string; subtitle: string }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get<{ results: typeof results }>(`/api/dashboard/search?q=${encodeURIComponent(query)}`);
        setResults(res.results);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [query, open]);

  return (
    <Modal open={open} onClose={onClose} title="Global Search" maxWidth="max-w-2xl">
      <div className="space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            autoFocus
            className={`${inputCls} pl-9`}
            placeholder="Search books, tasks, study topics, notes, vocabulary, goals..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {loading && <p className="text-xs text-slate-500">Searching local database...</p>}
        {!loading && query.trim() && results.length === 0 && (
          <p className="text-sm text-slate-500 py-6 text-center">No matching items found.</p>
        )}
        <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto">
          {results.map((r) => (
            <button
              key={`${r.type}_${r.id}`}
              onClick={() => {
                onNavigate(r.section);
                onClose();
              }}
              className="w-full text-left px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-lg flex items-center justify-between gap-4 cursor-pointer"
            >
              <div>
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{r.title}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{r.subtitle}</div>
              </div>
              <span className="text-xs text-blue-600 dark:text-blue-400 shrink-0">Open →</span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export function QuickAddModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [kind, setKind] = useState<'task' | 'book' | 'habit' | 'vocab' | 'goal'>('task');
  const [title, setTitle] = useState('');
  const [secondary, setSecondary] = useState('');
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [mandatory, setMandatory] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title / word is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (kind === 'task') {
        await api.post('/api/tasks', {
          title: title.trim(),
          task_type: 'quick',
          priority: 'medium',
          mandatory,
          due_date: dueDate || null,
          category: secondary.trim() || 'General',
        });
      } else if (kind === 'book') {
        await api.post('/api/books', {
          title: title.trim(),
          author: secondary.trim(),
          queue_bucket: 'LATER',
        });
      } else if (kind === 'habit') {
        await api.post('/api/tasks/habits', {
          title: title.trim(),
          category: secondary.trim() || 'Health',
          mandatory,
        });
      } else if (kind === 'vocab') {
        await api.post('/api/english/vocabulary', {
          word: title.trim(),
          meaning: secondary.trim() || 'Definition pending',
        });
      } else if (kind === 'goal') {
        await api.post('/api/goals', {
          title: title.trim(),
          area: secondary.trim() || 'Personal',
          target_date: dueDate || new Date().toISOString().slice(0, 10),
        });
      }
      setTitle('');
      setSecondary('');
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Quick Add">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-5 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          {(['task', 'book', 'habit', 'vocab', 'goal'] as const).map((k) => (
            <button
              type="button"
              key={k}
              onClick={() => setKind(k)}
              className={`py-1.5 text-xs font-medium rounded-md capitalize cursor-pointer ${
                kind === k
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {k}
            </button>
          ))}
        </div>

        <div>
          <label className={labelCls}>
            {kind === 'vocab' ? 'English Word / Phrase' : 'Title'}
          </label>
          <input
            autoFocus
            className={inputCls}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              kind === 'task'
                ? 'e.g., Finish chapter 4 summary'
                : kind === 'book'
                  ? 'e.g., Pragmatic Programmer'
                  : kind === 'vocab'
                    ? 'e.g., pragmatic'
                    : 'Enter title...'
            }
          />
        </div>

        <div>
          <label className={labelCls}>
            {kind === 'book'
              ? 'Author'
              : kind === 'vocab'
                ? 'Meaning'
                : kind === 'goal'
                  ? 'Area (Career, Health, Education...)'
                  : 'Category'}
          </label>
          <input
            className={inputCls}
            value={secondary}
            onChange={(e) => setSecondary(e.target.value)}
          />
        </div>

        {(kind === 'task' || kind === 'goal') && (
          <div>
            <label className={labelCls}>{kind === 'goal' ? 'Target Date' : 'Due Date'}</label>
            <input
              type="date"
              className={inputCls}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        )}

        {(kind === 'task' || kind === 'habit') && (
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={mandatory}
              onChange={(e) => setMandatory(e.target.checked)}
            />
            Mandatory for Daily Score
          </label>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            <Plus className="w-4 h-4" />
            {saving ? 'Saving...' : 'Create'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function NotificationsModal({
  open,
  onClose,
  notifications,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
  onNavigate: (section: string) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Reminders & Notifications">
      {notifications.length === 0 ? (
        <div className="text-center py-8 text-sm text-slate-500">
          <Bell className="w-6 h-6 mx-auto mb-2 opacity-40" />
          All caught up — no pending reminders or alerts.
        </div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {notifications.map((n) => (
            <div key={n.id} className="py-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {n.title}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{n.message}</div>
              </div>
              {n.link_section && (
                <Button
                  size="sm"
                  onClick={() => {
                    onNavigate(n.link_section!);
                    onClose();
                  }}
                >
                  Open
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
