import React, { useState } from 'react';
import { BookOpen, CheckCircle2, Compass } from 'lucide-react';
import { api } from '../lib/api.ts';
import { Button, Card, inputCls, labelCls } from './ui/Primitives.tsx';
import type { ThemeMode } from '../shared/types.ts';

export function OnboardingModal({
  onComplete,
}: {
  onComplete: (theme: ThemeMode) => void;
}) {
  const [name, setName] = useState('');
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [focusStart, setFocusStart] = useState('08:00');
  const [focusEnd, setFocusEnd] = useState('22:00');
  const [loadSample, setLoadSample] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleFinish(skip: boolean) {
    setSaving(true);
    setError('');
    try {
      await api.put('/api/system/settings', {
        profile_name: name.trim() || 'Learner',
        theme,
        daily_focus_start: focusStart,
        daily_focus_end: focusEnd,
        onboarding_completed: 1,
      });
      if (!skip && loadSample) {
        await api.post('/api/system/sample-data/load');
      }
      onComplete(theme);
    } catch (e: any) {
      setError(e.message || 'Failed to save onboarding settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
      <Card className="w-full max-w-lg" padding="p-6">
        <div className="flex items-center gap-2.5 text-blue-600 dark:text-blue-400 mb-2">
          <Compass className="w-5 h-5" />
          <span className="text-xs font-semibold tracking-wide">Welcome to Brain Sculpting Camp</span>
        </div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-50">
          Set up your offline Android hub
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Everything you enter is stored locally on your device in SQLite and app-managed storage. You can start empty or optionally load clearly labeled sample data to explore first.
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <label className={labelCls}>Your Display Name</label>
            <input
              className={inputCls}
              placeholder="e.g., Alex"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Appearance</label>
              <select
                className={inputCls}
                value={theme}
                onChange={(e) => setTheme(e.target.value as ThemeMode)}
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Focus Start</label>
              <input
                type="time"
                className={inputCls}
                value={focusStart}
                onChange={(e) => setFocusStart(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Focus End</label>
              <input
                type="time"
                className={inputCls}
                value={focusEnd}
                onChange={(e) => setFocusEnd(e.target.value)}
              />
            </div>
          </div>

          <label className="flex items-start gap-3 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
            <input
              type="checkbox"
              checked={loadSample}
              onChange={(e) => setLoadSample(e.target.checked)}
              className="mt-0.5 rounded border-slate-300"
            />
            <div className="text-sm">
              <div className="font-medium text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-blue-600" />
                Load optional sample data to explore workflows
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Adds sample books, tasks, habits, a study module, and vocabulary cards. All sample entries are clearly marked and can be removed in one click from Settings.
              </p>
            </div>
          </label>

          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-200 dark:border-slate-800">
          <Button variant="ghost" onClick={() => handleFinish(true)} disabled={saving}>
            Skip & Start Empty
          </Button>
          <Button variant="primary" onClick={() => handleFinish(false)} disabled={saving}>
            <CheckCircle2 className="w-4 h-4" />
            {saving ? 'Setting up...' : 'Enter Workspace'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
