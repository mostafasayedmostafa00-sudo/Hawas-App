import React, { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  Database,
  Download,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { api, downloadSnapshot, exportJsonBackup, importJsonBackup } from '../lib/api.ts';
import { parseScoreWeights } from '../shared/logic.ts';
import {
  Button,
  Card,
  LoadingRows,
  SectionHeader,
  inputCls,
  labelCls,
} from '../components/ui/Primitives.tsx';
import type { DailyScoreWeights, ThemeMode, UserSettings } from '../shared/types.ts';

export function SettingsView({
  onThemeChange,
  onSettingsUpdated,
}: {
  onThemeChange: (theme: ThemeMode) => void;
  onSettingsUpdated: () => void;
}) {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [weights, setWeights] = useState<DailyScoreWeights | null>(null);
  const [backups, setBackups] = useState<any[]>([]);
  const [aiStatus, setAiStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [savedMsg, setSavedMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [backupNotes, setBackupNotes] = useState('');
  const importInputRef = useRef<HTMLInputElement>(null);

  const isNativeAndroid = Capacitor.isNativePlatform();

  async function load() {
    setLoading(true);
    try {
      const [sRes, bRes, aiRes] = await Promise.all([
        api.get<{ settings: UserSettings }>('/api/system/settings'),
        api.get<{ backups: any[] }>('/api/system/backups'),
        api.get<any>('/api/ai/status'),
      ]);
      setSettings(sRes.settings);
      setWeights(parseScoreWeights(sRes.settings.score_weights_json));
      setBackups(bRes.backups);
      setAiStatus(aiRes);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function flashSaved(msg: string) {
    setErrorMsg('');
    setSavedMsg(msg);
    setTimeout(() => setSavedMsg(''), 4000);
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!settings || !weights) return;
    await api.put('/api/system/settings', {
      ...settings,
      score_weights_json: JSON.stringify(weights),
    });
    onThemeChange(settings.theme);
    onSettingsUpdated();
    flashSaved('Settings saved locally to on-device SQLite.');
  }

  async function handleJsonImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg('');
    try {
      const res = await importJsonBackup(file);
      onSettingsUpdated();
      await load();
      flashSaved(`Imported JSON backup (${res.restoredRows} rows across ${res.restoredTables} tables).`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to import JSON backup file.');
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
    }
  }

  if (loading || !settings || !weights) return <LoadingRows count={5} />;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Settings, Backups & Data Ownership"
        subtitle="100% offline configuration, Daily Score weights, on-device snapshots, and JSON export/import portability."
      />

      {savedMsg && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300">
          {savedMsg}
        </div>
      )}

      {errorMsg && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      <form onSubmit={saveSettings} className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <Card className="lg:col-span-6 space-y-4">
          <h3 className="text-sm font-semibold">Profile, Theme & Regional Preferences</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Profile Name</label>
              <input
                className={inputCls}
                value={settings.profile_name}
                onChange={(e) => setSettings({ ...settings, profile_name: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>Theme</label>
              <select
                className={inputCls}
                value={settings.theme}
                onChange={(e) => {
                  const t = e.target.value as ThemeMode;
                  setSettings({ ...settings, theme: t });
                  onThemeChange(t);
                }}
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Week Start Day</label>
              <select
                className={inputCls}
                value={settings.week_start_day}
                onChange={(e) => setSettings({ ...settings, week_start_day: e.target.value as any })}
              >
                <option value="monday">Monday</option>
                <option value="sunday">Sunday</option>
                <option value="saturday">Saturday</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Time Format</label>
              <select
                className={inputCls}
                value={settings.time_format}
                onChange={(e) => setSettings({ ...settings, time_format: e.target.value as any })}
              >
                <option value="24h">24-hour</option>
                <option value="12h">12-hour</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Daily Focus Start</label>
              <input
                type="time"
                className={inputCls}
                value={settings.daily_focus_start}
                onChange={(e) => setSettings({ ...settings, daily_focus_start: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>Daily Focus End</label>
              <input
                type="time"
                className={inputCls}
                value={settings.daily_focus_end}
                onChange={(e) => setSettings({ ...settings, daily_focus_end: e.target.value })}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={settings.notifications_enabled === 1}
              onChange={(e) => setSettings({ ...settings, notifications_enabled: e.target.checked ? 1 : 0 })}
            />
            Enable local reminders & overdue alerts
          </label>
        </Card>

        <Card className="lg:col-span-6 space-y-4">
          <h3 className="text-sm font-semibold">Weighted Daily Score Configuration</h3>
          <p className="text-xs text-slate-500">
            Adjust how strongly each life area contributes to your Weighted Daily Score on Home.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {(['tasks', 'habits', 'reading', 'study', 'english', 'workout'] as const).map((cat) => (
              <div key={cat}>
                <label className={`${labelCls} capitalize`}>{cat} Weight</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className={inputCls}
                  value={weights[cat]}
                  onChange={(e) => setWeights({ ...weights, [cat]: Number(e.target.value) })}
                />
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              On-Device English Practice Coach
            </h4>
            <p className="text-xs text-slate-500">
              Engine: {aiStatus?.provider || 'On-Device Practice Coach'} · Works 100% offline with zero external servers.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={settings.ai_enabled === 1}
                  onChange={(e) => setSettings({ ...settings, ai_enabled: e.target.checked ? 1 : 0 })}
                />
                Enable English Practice Coach & Speaking Drills
              </label>
              <div>
                <select
                  className={inputCls}
                  value={settings.ai_tutor_level}
                  onChange={(e) => setSettings({ ...settings, ai_tutor_level: e.target.value })}
                >
                  <option value="A2">Coach Target: A2</option>
                  <option value="B1">Coach Target: B1</option>
                  <option value="B2">Coach Target: B2</option>
                  <option value="C1">Coach Target: C1</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" variant="primary">
              Save Preferences
            </Button>
          </div>
        </Card>
      </form>

      {/* Backups, Restore & JSON Portability */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <Card className="lg:col-span-7 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Database className="w-4 h-4 text-blue-600" />
              On-Device Snapshots & JSON Backup Portability
            </h3>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    await exportJsonBackup();
                    flashSaved('Exported full JSON backup.');
                  } catch (err: any) {
                    setErrorMsg(err?.message || 'Unable to export JSON backup.');
                  }
                }}
              >
                <Download className="w-3.5 h-3.5" />
                Export JSON
              </Button>
              <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                Import JSON
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={handleJsonImport}
                />
              </label>
            </div>
          </div>

          <div className="flex gap-2">
            <input
              className={inputCls}
              placeholder="Backup note (e.g., Before moving to new phone)"
              value={backupNotes}
              onChange={(e) => setBackupNotes(e.target.value)}
            />
            <Button
              variant="primary"
              onClick={async () => {
                await api.post('/api/system/backups/create', { notes: backupNotes || 'Manual snapshot' });
                setBackupNotes('');
                load();
              }}
            >
              Create Snapshot
            </Button>
          </div>

          {backups.length === 0 ? (
            <p className="text-xs text-slate-500">
              No snapshots created yet. Click “Create Snapshot” to save a point-in-time on-device backup, or use “Export JSON” to transfer between devices.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
              {backups.map((b) => (
                <div key={b.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div>
                    <div className="font-mono font-medium">{b.file_name}</div>
                    <div className="text-slate-500">
                      {b.notes} · {(b.size_bytes / 1024).toFixed(1)} KB · {b.created_at.slice(0, 19).replace('T', ' ')}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={async () => {
                        try {
                          await downloadSnapshot(b.id);
                        } catch (err: any) {
                          setErrorMsg(err?.message || 'Unable to export snapshot.');
                        }
                      }}
                    >
                      <Download className="w-3 h-3" />
                      Export
                    </Button>
                    <Button
                      size="sm"
                      onClick={async () => {
                        await api.post(`/api/system/backups/${b.id}/restore`);
                        flashSaved(`Restored database from ${b.file_name} (automatic pre-restore safety snapshot saved).`);
                        onSettingsUpdated();
                        load();
                      }}
                    >
                      <RefreshCw className="w-3 h-3" />
                      Restore
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="lg:col-span-5 space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <HardDrive className="w-4 h-4 text-slate-500" />
            Sample Data & On-Device Storage Info
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Sample data is optional and tagged separately so you can explore workflows safely and clear sample entries without affecting your own records.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={async () => {
                await api.post('/api/system/sample-data/load');
                onSettingsUpdated();
                load();
              }}
            >
              Load Sample Data
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={async () => {
                await api.post('/api/system/sample-data/clear');
                onSettingsUpdated();
                load();
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear Sample Data Only
            </Button>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 space-y-1">
            <div>
              <strong>Runtime Mode:</strong>{' '}
              {isNativeAndroid ? `Capacitor Android (${Capacitor.getPlatform()} · 100% Offline)` : 'Web Offline Preview (sql.js + IndexedDB)'}
            </div>
            <div>
              <strong>Database Engine:</strong>{' '}
              <code className="font-mono">{isNativeAndroid ? '@capacitor-community/sqlite (on-device)' : 'sql.js SQLite (IndexedDB)'}</code>
            </div>
            <div>
              <strong>File Storage:</strong>{' '}
              <code className="font-mono">{isNativeAndroid ? 'Capacitor Directory.Data/bsc_storage' : 'IndexedDB (bsc_storage)'}</code>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
