import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  GitBranch,
  Link2,
  Plus,
  Sparkles,
  Target,
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

export function GoalsView() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [areaFilter, setAreaFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [milestoneDraft, setMilestoneDraft] = useState<Record<string, string>>({});
  const [linkDraft, setLinkDraft] = useState<Record<string, { type: string; id: string }>>({});
  const [form, setForm] = useState({
    parent_goal_id: '',
    title: '',
    description: '',
    area: 'Career',
    horizon: 'monthly',
    start_date: new Date().toISOString().slice(0, 10),
    target_date: '',
  });

  async function load() {
    setLoading(true);
    try {
      const res = await api.get<any>('/api/goals');
      setData(res);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading || !data) return <LoadingRows count={4} />;

  const areas = Array.from(new Set(['Personal', 'Career', 'Education', 'Health', 'Financial', 'Social', ...data.goals.map((g: any) => g.area)]));
  const visibleGoals = data.goals.filter((g: any) => (areaFilter === 'all' ? true : g.area === areaFilter));
  const topGoals = visibleGoals.filter((g: any) => !g.parent_goal_id);

  function renderGoalNode(g: any, depth = 0) {
    const children = visibleGoals.filter((c: any) => c.parent_goal_id === g.id);
    const linkSel = linkDraft[g.id] ?? { type: 'task', id: '' };
    const linkChoices =
      linkSel.type === 'task'
        ? data.linkableEntities.tasks
        : linkSel.type === 'book'
          ? data.linkableEntities.books
          : linkSel.type === 'course'
            ? data.linkableEntities.courses
            : data.linkableEntities.habits;

    return (
      <div key={g.id} className={depth > 0 ? 'ml-6 pl-4 border-l border-slate-200 dark:border-slate-800 mt-3' : ''}>
        <Card className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {g.area} · {g.horizon.replace('_', ' ')} · {g.start_date} → {g.target_date}
              </div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                {g.title}
              </h3>
              {g.description && <p className="text-xs text-slate-500 mt-0.5">{g.description}</p>}
            </div>

            <div className="flex items-center gap-2">
              <span className="font-mono text-lg font-semibold tabular-nums text-blue-600 dark:text-blue-400">
                {g.progress}%
              </span>
              <Button
                size="sm"
                onClick={() => {
                  setForm({
                    ...form,
                    parent_goal_id: g.id,
                    area: g.area,
                  });
                  setModalOpen(true);
                }}
              >
                <GitBranch className="w-3.5 h-3.5" />
                Add Sub-Goal
              </Button>
              <button
                onClick={async () => {
                  await api.del(`/api/goals/${g.id}`);
                  load();
                }}
                className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          <ProgressBar value={g.progress} />

          {g.scheduleEvaluation?.isBehind && (
            <div className="p-3 rounded-lg bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-slate-900 dark:text-slate-100">
                    Schedule Advisory (Requires Your Approval)
                  </div>
                  <div className="text-slate-600 dark:text-slate-300 mt-0.5">
                    {g.scheduleEvaluation.recommendation}
                  </div>
                </div>
              </div>
              {g.scheduleEvaluation.suggestedTargetDate && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={async () => {
                    await api.post(`/api/goals/${g.id}/approve-revision`, {
                      new_target_date: g.scheduleEvaluation.suggestedTargetDate,
                      redistribute_linked_tasks: true,
                    });
                    load();
                  }}
                >
                  Approve Revision ({g.scheduleEvaluation.suggestedTargetDate})
                </Button>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Milestones ({g.milestones.filter((m: any) => m.completed === 1).length}/{g.milestones.length})
              </div>
              {g.milestones.map((m: any) => (
                <div key={m.id} className="flex items-center justify-between text-xs">
                  <button
                    onClick={async () => {
                      await api.post(`/api/milestones/${m.id}/toggle`);
                      load();
                    }}
                    className="flex items-center gap-2 text-left cursor-pointer"
                  >
                    <span
                      className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                        m.completed ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 dark:border-slate-600'
                      }`}
                    >
                      {m.completed === 1 && <Check className="w-2.5 h-2.5" />}
                    </span>
                    <span className={m.completed ? 'line-through text-slate-400' : ''}>{m.title}</span>
                  </button>
                  <button
                    onClick={async () => {
                      await api.del(`/api/milestones/${m.id}`);
                      load();
                    }}
                    className="text-slate-400 hover:text-red-600 cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <div className="flex gap-1.5 pt-1">
                <input
                  className={`${inputCls} py-1 text-xs`}
                  placeholder="Add milestone..."
                  value={milestoneDraft[g.id] || ''}
                  onChange={(e) => setMilestoneDraft({ ...milestoneDraft, [g.id]: e.target.value })}
                />
                <Button
                  size="sm"
                  onClick={async () => {
                    const title = milestoneDraft[g.id]?.trim();
                    if (!title) return;
                    await api.post(`/api/goals/${g.id}/milestones`, { title });
                    setMilestoneDraft({ ...milestoneDraft, [g.id]: '' });
                    load();
                  }}
                >
                  Add
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1">
                <Link2 className="w-3.5 h-3.5" />
                Linked Activities ({g.links.length})
              </div>
              {g.links.map((l: any) => (
                <div key={l.id} className="flex items-center justify-between text-xs">
                  <span>
                    <span className="text-slate-400 mr-1.5">[{l.entity_type}]</span>
                    {l.entity_title}
                  </span>
                  <button
                    onClick={async () => {
                      await api.del(`/api/links/${l.id}`);
                      load();
                    }}
                    className="text-slate-400 hover:text-red-600 cursor-pointer"
                  >
                    Unlink
                  </button>
                </div>
              ))}

              {g.suggestions?.length > 0 && (
                <div className="pt-1 space-y-1">
                  <div className="text-[11px] text-blue-600 dark:text-blue-400 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    Suggested links:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {g.suggestions.map((sug: any) => (
                      <button
                        key={`${sug.entity_type}_${sug.entity_id}`}
                        onClick={async () => {
                          await api.post(`/api/goals/${g.id}/links`, sug);
                          load();
                        }}
                        className="text-[11px] px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer"
                      >
                        + {sug.entity_title}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-1.5 pt-1">
                <select
                  className={`${inputCls} w-24 py-1 text-xs`}
                  value={linkSel.type}
                  onChange={(e) => setLinkDraft({ ...linkDraft, [g.id]: { type: e.target.value, id: '' } })}
                >
                  <option value="task">Task</option>
                  <option value="book">Book</option>
                  <option value="course">Course</option>
                  <option value="habit">Habit</option>
                </select>
                <select
                  className={`${inputCls} py-1 text-xs`}
                  value={linkSel.id}
                  onChange={(e) => setLinkDraft({ ...linkDraft, [g.id]: { ...linkSel, id: e.target.value } })}
                >
                  <option value="">Select item...</option>
                  {linkChoices.map((ch: any) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.title}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  onClick={async () => {
                    const chosen = linkChoices.find((c: any) => c.id === linkSel.id);
                    if (!chosen) return;
                    await api.post(`/api/goals/${g.id}/links`, {
                      entity_type: linkSel.type,
                      entity_id: chosen.id,
                      entity_title: chosen.title,
                    });
                    load();
                  }}
                >
                  Link
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {children.map((ch: any) => renderGoalNode(ch, depth + 1))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Goals & Life Planning"
        subtitle="Create structured goals across life areas and horizons, nest sub-goals, link daily work, and review schedule advisories."
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setForm({ ...form, parent_goal_id: '' });
              setModalOpen(true);
            }}
          >
            <Plus className="w-4 h-4" />
            New Goal
          </Button>
        }
      />

      <div className="flex items-center gap-2 flex-wrap">
        <select
          className={`${inputCls} w-auto`}
          value={areaFilter}
          onChange={(e) => setAreaFilter(e.target.value)}
        >
          <option value="all">All Life Areas</option>
          {areas.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      {topGoals.length === 0 ? (
        <EmptyState
          icon={<Target className="w-8 h-8" />}
          title="No goals defined yet"
          description="Define a manual goal with milestones and link your tasks, books, courses, and habits."
          action={
            <Button variant="primary" onClick={() => setModalOpen(true)}>
              Create Goal
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">{topGoals.map((g: any) => renderGoalNode(g, 0))}</div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={form.parent_goal_id ? 'Add Nested Sub-Goal' : 'Create Goal'}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!form.title || !form.target_date) return;
            await api.post('/api/goals', form);
            setModalOpen(false);
            setForm({
              parent_goal_id: '',
              title: '',
              description: '',
              area: 'Career',
              horizon: 'monthly',
              start_date: new Date().toISOString().slice(0, 10),
              target_date: '',
            });
            load();
          }}
          className="space-y-4"
        >
          <div>
            <label className={labelCls}>Goal Title *</label>
            <input
              required
              className={inputCls}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Life Area</label>
              <input
                className={inputCls}
                list="goal-areas"
                value={form.area}
                onChange={(e) => setForm({ ...form, area: e.target.value })}
              />
              <datalist id="goal-areas">
                <option value="Personal" />
                <option value="Career" />
                <option value="Education" />
                <option value="Health" />
                <option value="Financial" />
                <option value="Social" />
              </datalist>
            </div>
            <div>
              <label className={labelCls}>Time Horizon</label>
              <select
                className={inputCls}
                value={form.horizon}
                onChange={(e) => setForm({ ...form, horizon: e.target.value })}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
                <option value="long_term">Long-term</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Start Date</label>
              <input
                type="date"
                className={inputCls}
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>Target Date *</label>
              <input
                type="date"
                required
                className={inputCls}
                value={form.target_date}
                onChange={(e) => setForm({ ...form, target_date: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea
              className={inputCls}
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save Goal
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
