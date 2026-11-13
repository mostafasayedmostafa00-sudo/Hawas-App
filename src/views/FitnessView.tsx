import React, { useEffect, useState } from 'react';
import { Dumbbell, HeartPulse, Plus, Scale, Trash2, Upload } from 'lucide-react';
import { api } from '../lib/api.ts';
import {
  Button,
  Card,
  LoadingRows,
  SectionHeader,
  SegmentedTabs,
  inputCls,
  labelCls,
} from '../components/ui/Primitives.tsx';
import { LocalStorageLink } from '../components/LocalStorageMedia.tsx';

export function FitnessView() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'workouts' | 'exercises' | 'body' | 'recovery'>('workouts');

  const [sessionForm, setSessionForm] = useState({
    title: '',
    category_name: 'Strength Training',
    session_date: new Date().toISOString().slice(0, 10),
    duration_minutes: '40',
    estimated_calories: '',
    notes: '',
    exercise_name: 'Push-Ups',
    reps: '12',
    weight_kg: '0',
  });
  const [catName, setCatName] = useState('');
  const [exForm, setExForm] = useState({ category_id: 'cat_strength', name: '', instructions: '' });
  const [measForm, setMeasForm] = useState({ weight_kg: '', waist_cm: '', chest_cm: '', arm_cm: '', notes: '' });
  const [measPhoto, setMeasPhoto] = useState<File | null>(null);
  const [recForm, setRecForm] = useState({
    log_date: new Date().toISOString().slice(0, 10),
    water_ml: '2000',
    meals_summary: '',
    sleep_hours: '7.5',
    energy_level: '4',
    is_rest_day: false,
    notes: '',
  });

  async function load() {
    setLoading(true);
    try {
      const res = await api.get<any>('/api/fitness');
      setData(res);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading || !data) return <LoadingRows count={4} />;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Workout & Fitness"
        subtitle="Lightweight secondary module for training logs, exercise library, body measurements, water/meals, and sleep recovery."
      />

      <SegmentedTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'workouts', label: `Workouts (${data.sessions.length})` },
          { id: 'exercises', label: `Exercises (${data.exercises.length})` },
          { id: 'body', label: `Body Tracking (${data.measurements.length})` },
          { id: 'recovery', label: 'Nutrition & Recovery' },
        ]}
      />

      {tab === 'workouts' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          <Card className="md:col-span-5">
            <h3 className="text-sm font-semibold mb-3">Log Workout Session</h3>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!sessionForm.title.trim()) return;
                await api.post('/api/fitness/sessions', {
                  ...sessionForm,
                  sets: sessionForm.exercise_name
                    ? [{ exercise_name: sessionForm.exercise_name, reps: sessionForm.reps, weight_kg: sessionForm.weight_kg }]
                    : [],
                });
                setSessionForm({ ...sessionForm, title: '', notes: '', estimated_calories: '' });
                load();
              }}
              className="space-y-3"
            >
              <input
                required
                className={inputCls}
                placeholder="Workout title (e.g., Upper Body A) *"
                value={sessionForm.title}
                onChange={(e) => setSessionForm({ ...sessionForm, title: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  className={inputCls}
                  value={sessionForm.category_name}
                  onChange={(e) => setSessionForm({ ...sessionForm, category_name: e.target.value })}
                >
                  {data.categories.map((c: any) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  className={inputCls}
                  value={sessionForm.session_date}
                  onChange={(e) => setSessionForm({ ...sessionForm, session_date: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>Duration (min)</label>
                  <input
                    type="number"
                    className={inputCls}
                    value={sessionForm.duration_minutes}
                    onChange={(e) => setSessionForm({ ...sessionForm, duration_minutes: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelCls}>Calories (Estimate, optional)</label>
                  <input
                    type="number"
                    className={inputCls}
                    placeholder="Omit if unknown"
                    value={sessionForm.estimated_calories}
                    onChange={(e) => setSessionForm({ ...sessionForm, estimated_calories: e.target.value })}
                  />
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 space-y-2">
                <div className="text-xs font-medium text-slate-600 dark:text-slate-300">Primary Set (PR tracked automatically)</div>
                <div className="grid grid-cols-3 gap-2">
                  <select
                    className={`${inputCls} col-span-3`}
                    value={sessionForm.exercise_name}
                    onChange={(e) => setSessionForm({ ...sessionForm, exercise_name: e.target.value })}
                  >
                    {data.exercises.map((ex: any) => (
                      <option key={ex.id} value={ex.name}>
                        {ex.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    className={inputCls}
                    placeholder="Reps"
                    value={sessionForm.reps}
                    onChange={(e) => setSessionForm({ ...sessionForm, reps: e.target.value })}
                  />
                  <input
                    type="number"
                    step="0.5"
                    className={inputCls}
                    placeholder="Weight kg"
                    value={sessionForm.weight_kg}
                    onChange={(e) => setSessionForm({ ...sessionForm, weight_kg: e.target.value })}
                  />
                </div>
              </div>

              <Button type="submit" variant="primary" size="sm">
                <Dumbbell className="w-3.5 h-3.5" />
                Save Workout
              </Button>
            </form>
          </Card>

          <Card className="md:col-span-7">
            <h3 className="text-sm font-semibold mb-3">Recent Workout History</h3>
            {data.sessions.length === 0 ? (
              <p className="text-sm text-slate-500 py-4">No workouts logged yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.sessions.map((s: any) => (
                  <div key={s.id} className="py-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">{s.title}</div>
                      <div className="text-xs text-slate-500 font-mono tabular-nums">
                        {s.session_date} · {s.category_name} · {s.duration_minutes}m
                        {s.estimated_calories ? ` · ~${s.estimated_calories} kcal (Estimate)` : ''}
                      </div>
                      {s.sets?.length > 0 && (
                        <div className="text-xs text-slate-600 dark:text-slate-300 mt-1 font-mono">
                          {s.sets.map((st: any) => (
                            <span key={st.id} className="mr-3">
                              {st.exercise_name}: {st.reps} × {st.weight_kg}kg {st.is_pr ? '(PR)' : ''}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={async () => {
                        await api.del(`/api/fitness/sessions/${s.id}`);
                        load();
                      }}
                      className="text-slate-400 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'exercises' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          <Card className="md:col-span-5 space-y-5">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!catName.trim()) return;
                await api.post('/api/fitness/categories', { name: catName.trim() });
                setCatName('');
                load();
              }}
              className="space-y-2"
            >
              <h3 className="text-sm font-semibold">Add Custom Category</h3>
              <div className="flex gap-2">
                <input
                  className={inputCls}
                  placeholder="e.g., Swimming, Climbing..."
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                />
                <Button type="submit" size="sm">
                  Add
                </Button>
              </div>
            </form>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!exForm.name.trim()) return;
                await api.post('/api/fitness/exercises', exForm);
                setExForm({ ...exForm, name: '', instructions: '' });
                load();
              }}
              className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800"
            >
              <h3 className="text-sm font-semibold">Add Custom Exercise</h3>
              <select
                className={inputCls}
                value={exForm.category_id}
                onChange={(e) => setExForm({ ...exForm, category_id: e.target.value })}
              >
                {data.categories.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                required
                className={inputCls}
                placeholder="Exercise name *"
                value={exForm.name}
                onChange={(e) => setExForm({ ...exForm, name: e.target.value })}
              />
              <textarea
                className={inputCls}
                rows={2}
                placeholder="Form cues / instructions..."
                value={exForm.instructions}
                onChange={(e) => setExForm({ ...exForm, instructions: e.target.value })}
              />
              <Button type="submit" variant="primary" size="sm">
                <Plus className="w-3.5 h-3.5" />
                Save Exercise
              </Button>
            </form>
          </Card>

          <Card className="md:col-span-7">
            <h3 className="text-sm font-semibold mb-3">Exercise Library</h3>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.exercises.map((ex: any) => (
                <div key={ex.id} className="py-2.5 text-sm">
                  <div className="font-medium">{ex.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{ex.instructions || 'No instructions'}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === 'body' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          <Card className="md:col-span-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
              <Scale className="w-4 h-4 text-blue-600" />
              Log Weight & Measurements
            </h3>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData();
                if (measForm.weight_kg) fd.append('weight_kg', measForm.weight_kg);
                if (measForm.waist_cm) fd.append('waist_cm', measForm.waist_cm);
                if (measForm.chest_cm) fd.append('chest_cm', measForm.chest_cm);
                if (measForm.arm_cm) fd.append('arm_cm', measForm.arm_cm);
                fd.append('notes', measForm.notes);
                if (measPhoto) fd.append('photo', measPhoto);
                await api.upload('/api/fitness/measurements', fd);
                setMeasForm({ weight_kg: '', waist_cm: '', chest_cm: '', arm_cm: '', notes: '' });
                setMeasPhoto(null);
                load();
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  step="0.1"
                  className={inputCls}
                  placeholder="Weight (kg)"
                  value={measForm.weight_kg}
                  onChange={(e) => setMeasForm({ ...measForm, weight_kg: e.target.value })}
                />
                <input
                  type="number"
                  step="0.1"
                  className={inputCls}
                  placeholder="Waist (cm)"
                  value={measForm.waist_cm}
                  onChange={(e) => setMeasForm({ ...measForm, waist_cm: e.target.value })}
                />
                <input
                  type="number"
                  step="0.1"
                  className={inputCls}
                  placeholder="Chest (cm)"
                  value={measForm.chest_cm}
                  onChange={(e) => setMeasForm({ ...measForm, chest_cm: e.target.value })}
                />
                <input
                  type="number"
                  step="0.1"
                  className={inputCls}
                  placeholder="Arm (cm)"
                  value={measForm.arm_cm}
                  onChange={(e) => setMeasForm({ ...measForm, arm_cm: e.target.value })}
                />
              </div>
              <label className="text-xs text-slate-500 flex items-center gap-1.5 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                {measPhoto ? measPhoto.name : 'Optional private on-device progress photo'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setMeasPhoto(e.target.files?.[0] ?? null)}
                />
              </label>
              <Button type="submit" variant="primary" size="sm">
                Save Measurement
              </Button>
            </form>
          </Card>

          <Card className="md:col-span-7">
            <h3 className="text-sm font-semibold mb-3">Measurement History</h3>
            {data.measurements.length === 0 ? (
              <p className="text-sm text-slate-500">No measurements recorded yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.measurements.map((m: any) => (
                  <div key={m.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums">
                    <div>
                      <span className="font-semibold text-sm mr-3">{m.measured_at}</span>
                      <span>
                        {m.weight_kg ? `${m.weight_kg} kg ` : ''}
                        {m.waist_cm ? `· Waist ${m.waist_cm} cm ` : ''}
                        {m.chest_cm ? `· Chest ${m.chest_cm} cm ` : ''}
                      </span>
                    </div>
                    {m.photo_path && (
                      <LocalStorageLink pathOrUrl={m.photo_path} label="View private photo" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'recovery' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          <Card className="md:col-span-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
              <HeartPulse className="w-4 h-4 text-emerald-600" />
              Water, Meals & Sleep Recovery Log
            </h3>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await api.post('/api/fitness/recovery', recForm);
                load();
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>Date</label>
                  <input
                    type="date"
                    className={inputCls}
                    value={recForm.log_date}
                    onChange={(e) => setRecForm({ ...recForm, log_date: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelCls}>Water (ml)</label>
                  <input
                    type="number"
                    className={inputCls}
                    value={recForm.water_ml}
                    onChange={(e) => setRecForm({ ...recForm, water_ml: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelCls}>Sleep Hours</label>
                  <input
                    type="number"
                    step="0.5"
                    className={inputCls}
                    value={recForm.sleep_hours}
                    onChange={(e) => setRecForm({ ...recForm, sleep_hours: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelCls}>Energy (1–5)</label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    className={inputCls}
                    value={recForm.energy_level}
                    onChange={(e) => setRecForm({ ...recForm, energy_level: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Meals Summary</label>
                <textarea
                  className={inputCls}
                  rows={2}
                  placeholder="Light meal notes..."
                  value={recForm.meals_summary}
                  onChange={(e) => setRecForm({ ...recForm, meals_summary: e.target.value })}
                />
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={recForm.is_rest_day}
                  onChange={(e) => setRecForm({ ...recForm, is_rest_day: e.target.checked })}
                />
                Mark as planned rest day
              </label>
              <Button type="submit" variant="primary" size="sm">
                Save Daily Log
              </Button>
            </form>
          </Card>

          <Card className="md:col-span-7">
            <h3 className="text-sm font-semibold mb-3">Recent Recovery Logs</h3>
            {data.recoveryLogs.length === 0 ? (
              <p className="text-sm text-slate-500">No recovery logs saved yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.recoveryLogs.map((l: any) => (
                  <div key={l.id} className="py-2.5 text-xs space-y-1">
                    <div className="flex justify-between font-mono tabular-nums">
                      <span className="font-semibold text-sm">{l.log_date}</span>
                      <span>
                        Water {l.water_ml} ml · Sleep {l.sleep_hours ?? '—'}h · Energy {l.energy_level ?? '—'}/5{' '}
                        {l.is_rest_day ? '· Rest Day' : ''}
                      </span>
                    </div>
                    {l.meals_summary && <p className="text-slate-600 dark:text-slate-300">{l.meals_summary}</p>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
