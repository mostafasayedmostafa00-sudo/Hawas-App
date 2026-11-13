import React, { useEffect, useState } from 'react';
import { BarChart3, Download, Info, Printer } from 'lucide-react';
import { api } from '../lib/api.ts';
import {
  Button,
  Card,
  LoadingRows,
  SectionHeader,
  SegmentedTabs,
  inputCls,
} from '../components/ui/Primitives.tsx';

export function AnalyticsView() {
  const [range, setRange] = useState<'7d' | '30d' | '90d' | '365d'>('30d');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get<any>(`/api/dashboard/analytics?range=${range}`);
      setData(res);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [range]);

  function exportCsv() {
    if (!data) return;
    const rows = [
      ['Date', 'Reading Minutes', 'Study Minutes', 'Workout Minutes', 'Habits Completed'],
      ...data.dailySeries.map((d: any) => [d.date, d.readingMin, d.studyMin, d.workoutMin, d.habitsDone]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `brain_sculpting_analytics_${range}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading || !data) return <LoadingRows count={5} />;

  const m = data.metrics;
  const maxDayMinutes = Math.max(
    10,
    ...data.dailySeries.map((d: any) => d.readingMin + d.studyMin + d.workoutMin)
  );

  const cards = [
    {
      key: 'tasks',
      title: 'Tasks & Execution',
      primary: m.tasks.completionRate !== null ? `${m.tasks.completionRate}%` : 'N/A',
      detail: `${m.tasks.completed} / ${m.tasks.total} completed · ${m.tasks.trackedMinutes}m timed`,
      method: data.methodology.tasks,
    },
    {
      key: 'habits',
      title: 'Habit Consistency',
      primary: m.habits.consistencyRate !== null ? `${m.habits.consistencyRate}%` : 'N/A',
      detail: `${m.habits.completedEntries} / ${m.habits.loggedEntries} logged entries`,
      method: data.methodology.habits,
    },
    {
      key: 'reading',
      title: 'Books & Reading',
      primary: `${m.reading.minutes} min`,
      detail: `${m.reading.pagesRead} pages across ${m.reading.sessionsCount} sessions`,
      method: data.methodology.reading,
    },
    {
      key: 'study',
      title: 'Study (Actual vs Planned)',
      primary: `${m.study.totalActualMinutes}m`,
      detail: `${m.study.completedTopics}/${m.study.totalTopics} topics · Planned ${m.study.totalPlannedMinutes}m`,
      method: data.methodology.study,
    },
    {
      key: 'english',
      title: 'English Mastery',
      primary: `${m.english.vocabMastered}/${m.english.vocabTotal}`,
      detail: `Mastered vocabulary · ${m.english.speakingRecordings} speaking recordings`,
      method: data.methodology.english,
    },
    {
      key: 'workout',
      title: 'Workout & Goals',
      primary: `${m.workout.sessionsCount} workouts`,
      detail: `${m.workout.totalMinutes}m active · ${m.goals.completed}/${m.goals.total} goals finished`,
      method: 'Count of logged workout sessions and goal completion status.',
    },
  ].filter((c) => moduleFilter === 'all' || c.key === moduleFilter);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Analytics & Reports"
        subtitle={`Cross-module trends and consistency since ${data.sinceDate}. Missing data is displayed honestly as N/A.`}
        actions={
          <>
            <Button onClick={exportCsv}>
              <Download className="w-4 h-4" />
              Export CSV
            </Button>
            <Button onClick={() => window.print()}>
              <Printer className="w-4 h-4" />
              Print / Save PDF
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs
          value={range}
          onChange={setRange}
          tabs={[
            { id: '7d', label: '7 Days' },
            { id: '30d', label: '30 Days' },
            { id: '90d', label: '90 Days' },
            { id: '365d', label: '1 Year' },
          ]}
        />
        <select
          className={`${inputCls} w-auto`}
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
        >
          <option value="all">All Modules</option>
          <option value="tasks">Tasks</option>
          <option value="habits">Habits</option>
          <option value="reading">Reading</option>
          <option value="study">Study</option>
          <option value="english">English</option>
          <option value="workout">Workout & Goals</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {cards.map((c) => (
          <Card key={c.key} className="space-y-2">
            <div className="text-xs font-medium text-slate-500">{c.title}</div>
            <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-50">
              {c.primary}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-300 font-mono tabular-nums">{c.detail}</div>
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
              <span>{c.method}</span>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <BarChart3 className="w-4 h-4 text-blue-600" />
            Daily Focus Minutes (Recent {data.dailySeries.length} Days)
          </h3>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-blue-600 inline-block" /> Study
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block" /> Reading
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 inline-block" /> Workout
            </span>
          </div>
        </div>

        <div className="flex items-end gap-1.5 h-44 pt-4 border-b border-slate-200 dark:border-slate-800">
          {data.dailySeries.map((d: any) => {
            const sH = Math.round((d.studyMin / maxDayMinutes) * 140);
            const rH = Math.round((d.readingMin / maxDayMinutes) * 140);
            const wH = Math.round((d.workoutMin / maxDayMinutes) * 140);
            return (
              <div
                key={d.date}
                title={`${d.date}: Study ${d.studyMin}m, Reading ${d.readingMin}m, Workout ${d.workoutMin}m, Habits ${d.habitsDone}`}
                className="flex-1 flex flex-col justify-end items-center gap-px h-full"
              >
                {wH > 0 && <div className="w-full bg-amber-500 rounded-t-xs" style={{ height: `${wH}px` }} />}
                {rH > 0 && <div className="w-full bg-emerald-500" style={{ height: `${rH}px` }} />}
                {sH > 0 && <div className="w-full bg-blue-600" style={{ height: `${sH}px` }} />}
                {sH === 0 && rH === 0 && wH === 0 && (
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-1 rounded-xs" />
                )}
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-[11px] font-mono text-slate-400 mt-1.5">
          <span>{data.dailySeries[0]?.date}</span>
          <span>{data.dailySeries[data.dailySeries.length - 1]?.date}</span>
        </div>
      </Card>
    </div>
  );
}
