import React, { useEffect, useRef, useState } from 'react';
import {
  Award,
  Check,
  MessageSquare,
  Mic,
  PenTool,
  Plus,
  Send,
  Sparkles,
  Square,
  Trash2,
  Volume2,
} from 'lucide-react';
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
import { LocalAudioPlayer, LocalStorageLink } from '../components/LocalStorageMedia.tsx';
import type { CEFRLevel, EnglishSkill } from '../shared/types.ts';

const SKILLS: EnglishSkill[] = ['speaking', 'listening', 'reading', 'writing', 'vocabulary', 'grammar'];
const CEFR_LEVELS: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export function EnglishView({ onNavigate }: { onNavigate: (s: string) => void }) {
  const [data, setData] = useState<any>(null);
  const [aiStatus, setAiStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'plan' | 'vocab' | 'speaking' | 'cefr' | 'writing' | 'resources' | 'tutor'>('plan');

  // Plan form
  const [planForm, setPlanForm] = useState({ skill: 'speaking', title: '', target_minutes: '15' });

  // Vocab & Flashcard / Quiz state
  const [vocabForm, setVocabForm] = useState({ word: '', meaning: '', part_of_speech: 'noun', example: '', tags: '' });
  const [vocabMode, setVocabMode] = useState<'list' | 'flashcards' | 'quiz'>('list');
  const [cardIdx, setCardIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [quizAnswer, setQuizAnswer] = useState('');
  const [quizFeedback, setQuizFeedback] = useState('');

  // Speaking Studio recorder state
  const [recTopic, setRecTopic] = useState('Explain a technical decision I made recently');
  const [recNotes, setRecNotes] = useState('');
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const [speakingError, setSpeakingError] = useState('');
  const [aiFeedbackLoading, setAiFeedbackLoading] = useState<string | null>(null);

  // CEFR form
  const [cefrForm, setCefrForm] = useState({
    overall_level: 'B1',
    speaking: 'B1',
    listening: 'B1',
    reading: 'B2',
    writing: 'B1',
    vocabulary: 'B1',
    grammar: 'B1',
    notes: '',
  });

  // Writing Workspace
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [draftForm, setDraftForm] = useState({ title: '', prompt: '', content: '', status: 'draft' });

  // Resources
  const [resForm, setResForm] = useState({ title: '', resource_type: 'youtube', url_or_path: '', skills: ['listening'] as string[], notes: '' });

  // On-Device Practice Coach
  const [tutorMode, setTutorMode] = useState('conversation');
  const [tutorMessages, setTutorMessages] = useState<any[]>([]);
  const [tutorInput, setTutorInput] = useState('');
  const [tutorSending, setTutorSending] = useState(false);
  const [tutorError, setTutorError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [en, ai] = await Promise.all([
        api.get<any>('/api/english'),
        api.get<any>('/api/ai/status'),
      ]);
      setData(en);
      setAiStatus(ai);
    } finally {
      setLoading(false);
    }
  }

  async function loadTutorHistory(mode: string) {
    const res = await api.get<{ messages: any[] }>(`/api/ai/tutor/history?mode=${mode}`);
    setTutorMessages(res.messages);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (tab === 'tutor') loadTutorHistory(tutorMode);
  }, [tab, tutorMode]);

  async function startRecording() {
    setSpeakingError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const fd = new FormData();
        fd.append('audio', blob, `speaking_${Date.now()}.webm`);
        fd.append('topic', recTopic || 'Speaking Practice');
        fd.append('duration_seconds', String(recSeconds));
        fd.append('mistake_notes', recNotes);
        await api.upload('/api/english/recordings', fd);
        setRecSeconds(0);
        setRecNotes('');
        load();
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
      setRecSeconds(0);
      timerRef.current = window.setInterval(() => setRecSeconds((s) => s + 1), 1000);
    } catch (err: any) {
      setSpeakingError(err?.message || 'Microphone access was denied or unavailable.');
    }
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  async function sendTutorMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!tutorInput.trim() || tutorSending) return;
    setTutorError('');
    setTutorSending(true);
    const text = tutorInput.trim();
    setTutorInput('');
    try {
      await api.post('/api/ai/tutor/chat', {
        mode: tutorMode,
        message: text,
        level: aiStatus?.tutorLevel || 'B2',
      });
      await loadTutorHistory(tutorMode);
    } catch (err: any) {
      setTutorError(err.message);
      setTutorInput(text);
    } finally {
      setTutorSending(false);
    }
  }

  if (loading || !data) return <LoadingRows count={5} />;

  const today = new Date().toISOString().slice(0, 10);
  const dueCards = data.vocabulary.filter((v: any) => v.next_review_date <= today);
  const latestCefr = data.cefr[0] ?? null;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="English Learning"
        subtitle="Speaking, Listening, Reading, Writing, Vocabulary, Grammar, CEFR A1–C2 tracking, Speaking Studio, and Offline Practice Coach."
        actions={
          latestCefr ? (
            <span className="text-xs font-mono px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
              Current CEFR: <strong>{latestCefr.overall_level}</strong>
            </span>
          ) : undefined
        }
      />

      <SegmentedTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'plan', label: 'Daily Plan' },
          { id: 'vocab', label: 'Vocabulary & Flashcards', count: dueCards.length },
          { id: 'speaking', label: 'Speaking Studio', count: data.recordings.length },
          { id: 'cefr', label: 'CEFR A1–C2' },
          { id: 'writing', label: 'Writing Workspace', count: data.writings.length },
          { id: 'resources', label: 'Resources', count: data.resources.length },
          { id: 'tutor', label: 'Practice Coach' },
        ]}
      />

      {tab === 'plan' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          <Card className="md:col-span-7 space-y-3">
            <h3 className="text-sm font-semibold">Today’s English Plan (All 6 Skills)</h3>
            {data.dailyPlan.length === 0 ? (
              <p className="text-sm text-slate-500">Add daily English practice items on the right to build your editable routine.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.dailyPlan.map((p: any) => (
                  <div key={p.id} className="py-2.5 flex items-center justify-between gap-3">
                    <button
                      onClick={async () => {
                        await api.post(`/api/english/plan/${p.id}/toggle`);
                        load();
                      }}
                      className="flex items-center gap-2.5 text-left cursor-pointer"
                    >
                      <span
                        className={`w-4 h-4 rounded border flex items-center justify-center ${
                          p.completed_today ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 dark:border-slate-600'
                        }`}
                      >
                        {p.completed_today === 1 && <Check className="w-3 h-3" />}
                      </span>
                      <div>
                        <div className={`text-sm font-medium ${p.completed_today ? 'line-through text-slate-400' : ''}`}>
                          {p.title}
                        </div>
                        <div className="text-xs text-slate-500">
                          {p.skill} · {p.target_minutes} min
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={async () => {
                        await api.del(`/api/english/plan/${p.id}`);
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

          <Card className="md:col-span-5">
            <h3 className="text-sm font-semibold mb-3">Add Daily Practice Item</h3>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!planForm.title.trim()) return;
                await api.post('/api/english/plan', planForm);
                setPlanForm({ ...planForm, title: '' });
                load();
              }}
              className="space-y-3"
            >
              <div>
                <label className={labelCls}>Skill</label>
                <select
                  className={inputCls}
                  value={planForm.skill}
                  onChange={(e) => setPlanForm({ ...planForm, skill: e.target.value })}
                >
                  {SKILLS.map((s) => (
                    <option key={s} value={s}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Activity</label>
                <input
                  required
                  className={inputCls}
                  placeholder="e.g., Shadow 10 min podcast"
                  value={planForm.title}
                  onChange={(e) => setPlanForm({ ...planForm, title: e.target.value })}
                />
              </div>
              <div>
                <label className={labelCls}>Target Minutes</label>
                <input
                  type="number"
                  min={1}
                  className={inputCls}
                  value={planForm.target_minutes}
                  onChange={(e) => setPlanForm({ ...planForm, target_minutes: e.target.value })}
                />
              </div>
              <Button type="submit" variant="primary" size="sm">
                <Plus className="w-3.5 h-3.5" />
                Add to Plan
              </Button>
            </form>
          </Card>
        </div>
      )}

      {tab === 'vocab' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SegmentedTabs
              value={vocabMode}
              onChange={(v) => {
                setVocabMode(v);
                setCardIdx(0);
                setShowAnswer(false);
                setQuizFeedback('');
              }}
              tabs={[
                { id: 'list', label: `Dictionary (${data.vocabulary.length})` },
                { id: 'flashcards', label: `Flashcards Due (${dueCards.length})` },
                { id: 'quiz', label: 'Recall Quiz' },
              ]}
            />
          </div>

          {vocabMode === 'list' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
              <Card className="md:col-span-4">
                <h3 className="text-sm font-semibold mb-3">Add Vocabulary Item</h3>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!vocabForm.word || !vocabForm.meaning) return;
                    await api.post('/api/english/vocabulary', vocabForm);
                    setVocabForm({ word: '', meaning: '', part_of_speech: 'noun', example: '', tags: '' });
                    load();
                  }}
                  className="space-y-2.5"
                >
                  <input
                    required
                    className={inputCls}
                    placeholder="Word or phrase *"
                    value={vocabForm.word}
                    onChange={(e) => setVocabForm({ ...vocabForm, word: e.target.value })}
                  />
                  <input
                    required
                    className={inputCls}
                    placeholder="Meaning *"
                    value={vocabForm.meaning}
                    onChange={(e) => setVocabForm({ ...vocabForm, meaning: e.target.value })}
                  />
                  <select
                    className={inputCls}
                    value={vocabForm.part_of_speech}
                    onChange={(e) => setVocabForm({ ...vocabForm, part_of_speech: e.target.value })}
                  >
                    <option value="noun">Noun</option>
                    <option value="verb">Verb</option>
                    <option value="adjective">Adjective</option>
                    <option value="adverb">Adverb</option>
                    <option value="phrase">Phrase / Idiom</option>
                  </select>
                  <textarea
                    className={inputCls}
                    rows={2}
                    placeholder="Example sentence..."
                    value={vocabForm.example}
                    onChange={(e) => setVocabForm({ ...vocabForm, example: e.target.value })}
                  />
                  <Button type="submit" variant="primary" size="sm">
                    Save Word
                  </Button>
                </form>
              </Card>

              <Card className="md:col-span-8">
                <h3 className="text-sm font-semibold mb-3">Personal Dictionary</h3>
                {data.vocabulary.length === 0 ? (
                  <p className="text-sm text-slate-500 py-4">No vocabulary saved yet.</p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[460px] overflow-y-auto">
                    {data.vocabulary.map((v: any) => (
                      <div key={v.id} className="py-2.5 flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold">
                            {v.word}{' '}
                            <span className="text-xs font-normal text-slate-500">({v.part_of_speech})</span>
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{v.meaning}</div>
                          {v.example && <div className="text-xs italic text-slate-500 mt-0.5">“{v.example}”</div>}
                          <div className="text-[11px] font-mono text-slate-400 mt-1">
                            Next review: {v.next_review_date} · Interval: {v.interval_days}d {v.mastered ? '· Mastered' : ''}
                          </div>
                        </div>
                        <button
                          onClick={async () => {
                            await api.del(`/api/english/vocabulary/${v.id}`);
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

          {vocabMode === 'flashcards' && (
            <Card className="max-w-xl mx-auto text-center py-8">
              {dueCards.length === 0 ? (
                <p className="text-sm text-slate-500">All vocabulary flashcards are reviewed for today.</p>
              ) : (
                (() => {
                  const card = dueCards[cardIdx % dueCards.length];
                  return (
                    <div className="space-y-4">
                      <div className="text-xs font-mono text-slate-400">
                        Card {(cardIdx % dueCards.length) + 1} of {dueCards.length} · {card.part_of_speech}
                      </div>
                      <h3 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">{card.word}</h3>
                      {showAnswer ? (
                        <div className="space-y-2 pt-2">
                          <p className="text-base text-slate-700 dark:text-slate-200">{card.meaning}</p>
                          {card.example && <p className="text-xs italic text-slate-500">“{card.example}”</p>}
                          <div className="flex justify-center gap-2 pt-4">
                            {[
                              { q: 1, label: 'Again' },
                              { q: 3, label: 'Hard' },
                              { q: 4, label: 'Good' },
                              { q: 5, label: 'Easy' },
                            ].map((btn) => (
                              <Button
                                key={btn.q}
                                size="sm"
                                variant={btn.q >= 4 ? 'primary' : 'secondary'}
                                onClick={async () => {
                                  await api.post(`/api/english/vocabulary/${card.id}/review`, { quality: btn.q });
                                  setShowAnswer(false);
                                  setCardIdx((i) => i + 1);
                                  load();
                                }}
                              >
                                {btn.label}
                              </Button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <Button variant="primary" onClick={() => setShowAnswer(true)}>
                          Show Meaning
                        </Button>
                      )}
                    </div>
                  );
                })()
              )}
            </Card>
          )}

          {vocabMode === 'quiz' && (
            <Card className="max-w-xl mx-auto space-y-4">
              {data.vocabulary.length === 0 ? (
                <p className="text-sm text-slate-500">Add vocabulary items first to start a recall quiz.</p>
              ) : (
                (() => {
                  const card = data.vocabulary[cardIdx % data.vocabulary.length];
                  return (
                    <>
                      <div className="text-xs text-slate-500">Type the word matching this meaning:</div>
                      <p className="text-base font-medium text-slate-900 dark:text-slate-100">{card.meaning}</p>
                      <div className="flex gap-2">
                        <input
                          className={inputCls}
                          placeholder="Type the English word..."
                          value={quizAnswer}
                          onChange={(e) => setQuizAnswer(e.target.value)}
                        />
                        <Button
                          variant="primary"
                          onClick={() => {
                            if (quizAnswer.trim().toLowerCase() === card.word.trim().toLowerCase()) {
                              setQuizFeedback('Correct!');
                            } else {
                              setQuizFeedback(`Expected: ${card.word}`);
                            }
                          }}
                        >
                          Check
                        </Button>
                        <Button
                          onClick={() => {
                            setCardIdx((i) => i + 1);
                            setQuizAnswer('');
                            setQuizFeedback('');
                          }}
                        >
                          Next
                        </Button>
                      </div>
                      {quizFeedback && <p className="text-sm font-medium text-blue-600">{quizFeedback}</p>}
                    </>
                  );
                })()
              )}
            </Card>
          )}
        </div>
      )}

      {tab === 'speaking' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          <Card className="md:col-span-5 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Mic className="w-4 h-4 text-blue-600" />
              Speaking Studio (On-Device Audio Recorder)
            </h3>
            <div>
              <label className={labelCls}>Practice Topic / Prompt</label>
              <input
                className={inputCls}
                value={recTopic}
                onChange={(e) => setRecTopic(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Self-Observed Mistake Notes</label>
              <textarea
                className={inputCls}
                rows={2}
                placeholder="Note pronunciation, grammar slips, or filler words..."
                value={recNotes}
                onChange={(e) => setRecNotes(e.target.value)}
              />
            </div>
            {speakingError && <p className="text-xs text-red-600">{speakingError}</p>}
            <div className="flex items-center gap-3 pt-1">
              {!recording ? (
                <Button variant="primary" onClick={startRecording}>
                  <Mic className="w-4 h-4" />
                  Record Audio
                </Button>
              ) : (
                <Button variant="danger" onClick={stopRecording}>
                  <Square className="w-4 h-4" />
                  Stop & Save ({recSeconds}s)
                </Button>
              )}
            </div>
          </Card>

          <Card className="md:col-span-7 space-y-3">
            <h3 className="text-sm font-semibold">Saved Speaking Recordings ({data.recordings.length})</h3>
            {data.recordings.length === 0 ? (
              <p className="text-sm text-slate-500 py-4">No recordings saved yet. Record a short talk to track speaking progress over time.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 space-y-3">
                {data.recordings.map((r: any) => (
                  <div key={r.id} className="pt-3 first:pt-0 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{r.topic}</span>
                      <span className="text-xs font-mono text-slate-500">
                        {r.created_at.slice(0, 10)} · {r.duration_seconds}s
                      </span>
                    </div>
                    <LocalAudioPlayer audioPath={r.audio_path} />
                    {r.mistake_notes && <p className="text-xs text-slate-600 dark:text-slate-300">Notes: {r.mistake_notes}</p>}
                    {r.ai_feedback && (
                      <div className="p-2.5 rounded bg-blue-50/70 dark:bg-blue-950/30 text-xs text-slate-700 dark:text-slate-200">
                        <strong>Coach Drill Feedback:</strong> {r.ai_feedback}
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <Button
                        size="sm"
                        disabled={aiFeedbackLoading === r.id}
                        onClick={async () => {
                          setAiFeedbackLoading(r.id);
                          try {
                            await api.post('/api/ai/speaking/analyze', { recordingId: r.id });
                            load();
                          } catch (err: any) {
                            setSpeakingError(err.message);
                          } finally {
                            setAiFeedbackLoading(null);
                          }
                        }}
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        {aiFeedbackLoading === r.id ? 'Analyzing...' : 'Offline Coach Feedback'}
                      </Button>
                      <button
                        onClick={async () => {
                          await api.del(`/api/english/recordings/${r.id}`);
                          load();
                        }}
                        className="text-xs text-slate-400 hover:text-red-600 cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'cefr' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          <Card className="md:col-span-5">
            <h3 className="text-sm font-semibold mb-3">Log Periodic CEFR Self-Assessment (A1–C2)</h3>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await api.post('/api/english/cefr', cefrForm);
                setCefrForm({ ...cefrForm, notes: '' });
                load();
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-2 gap-2.5">
                {(['overall_level', ...SKILLS] as const).map((field) => (
                  <div key={field}>
                    <label className={labelCls}>{field.replace('_', ' ')}</label>
                    <select
                      className={inputCls}
                      value={(cefrForm as any)[field]}
                      onChange={(e) => setCefrForm({ ...cefrForm, [field]: e.target.value })}
                    >
                      {CEFR_LEVELS.map((lv) => (
                        <option key={lv} value={lv}>
                          {lv}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <textarea
                className={inputCls}
                rows={2}
                placeholder="Reflection notes..."
                value={cefrForm.notes}
                onChange={(e) => setCefrForm({ ...cefrForm, notes: e.target.value })}
              />
              <Button type="submit" variant="primary" size="sm">
                <Award className="w-3.5 h-3.5" />
                Save CEFR Snapshot
              </Button>
            </form>
          </Card>
          <Card className="md:col-span-7">
            <h3 className="text-sm font-semibold mb-3">CEFR History</h3>
            {data.cefr.length === 0 ? (
              <p className="text-sm text-slate-500">No CEFR assessments logged yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.cefr.map((c: any) => (
                  <div key={c.id} className="py-3 text-xs space-y-1">
                    <div className="flex justify-between font-mono">
                      <span className="font-semibold text-sm">Overall: {c.overall_level}</span>
                      <span className="text-slate-500">{c.assessed_at}</span>
                    </div>
                    <div className="text-slate-600 dark:text-slate-300 font-mono">
                      Speaking {c.speaking} · Listening {c.listening} · Reading {c.reading} · Writing {c.writing} · Vocab {c.vocabulary} · Grammar {c.grammar}
                    </div>
                    {c.notes && <p className="text-slate-500">{c.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'writing' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          <Card className="md:col-span-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Drafts</h3>
              <Button
                size="sm"
                onClick={() => {
                  setActiveDraftId(null);
                  setDraftForm({ title: '', prompt: '', content: '', status: 'draft' });
                }}
              >
                New Draft
              </Button>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.writings.map((w: any) => (
                <div key={w.id} className="py-2 flex items-center justify-between text-xs">
                  <button
                    onClick={() => {
                      setActiveDraftId(w.id);
                      setDraftForm({ title: w.title, prompt: w.prompt, content: w.content, status: w.status });
                    }}
                    className="text-left hover:text-blue-600 cursor-pointer"
                  >
                    <div className="font-medium text-sm">{w.title}</div>
                    <div className="text-slate-500 font-mono">
                      {w.word_count} words · {w.status}
                    </div>
                  </button>
                  <button
                    onClick={async () => {
                      await api.del(`/api/english/writings/${w.id}`);
                      load();
                    }}
                    className="text-slate-400 hover:text-red-600 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </Card>

          <Card className="md:col-span-8">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!draftForm.title.trim()) return;
                if (activeDraftId) {
                  await api.put(`/api/english/writings/${activeDraftId}`, draftForm);
                } else {
                  const res = await api.post<{ writing: any }>('/api/english/writings', draftForm);
                  setActiveDraftId(res.writing.id);
                }
                load();
              }}
              className="space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <PenTool className="w-4 h-4 text-blue-600" />
                  Writing Workspace
                </h3>
                <select
                  className={`${inputCls} w-auto py-1 text-xs`}
                  value={draftForm.status}
                  onChange={(e) => setDraftForm({ ...draftForm, status: e.target.value })}
                >
                  <option value="draft">Draft</option>
                  <option value="revised">Revised</option>
                  <option value="final">Final</option>
                </select>
              </div>
              <input
                required
                className={inputCls}
                placeholder="Essay / Email / Reflection Title *"
                value={draftForm.title}
                onChange={(e) => setDraftForm({ ...draftForm, title: e.target.value })}
              />
              <input
                className={inputCls}
                placeholder="Writing prompt or topic (optional)"
                value={draftForm.prompt}
                onChange={(e) => setDraftForm({ ...draftForm, prompt: e.target.value })}
              />
              <textarea
                className={inputCls}
                rows={10}
                placeholder="Write in English..."
                value={draftForm.content}
                onChange={(e) => setDraftForm({ ...draftForm, content: e.target.value })}
              />
              <div className="flex justify-between items-center text-xs text-slate-500">
                <span className="font-mono tabular-nums">
                  {draftForm.content.trim() ? draftForm.content.trim().split(/\s+/).length : 0} words
                </span>
                <Button type="submit" variant="primary" size="sm">
                  Save Draft Locally
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {tab === 'resources' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          <Card className="md:col-span-4">
            <h3 className="text-sm font-semibold mb-3">Add English Resource</h3>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!resForm.title || !resForm.url_or_path) return;
                await api.post('/api/english/resources', resForm);
                setResForm({ title: '', resource_type: 'youtube', url_or_path: '', skills: ['listening'], notes: '' });
                load();
              }}
              className="space-y-3"
            >
              <input
                required
                className={inputCls}
                placeholder="Title *"
                value={resForm.title}
                onChange={(e) => setResForm({ ...resForm, title: e.target.value })}
              />
              <select
                className={inputCls}
                value={resForm.resource_type}
                onChange={(e) => setResForm({ ...resForm, resource_type: e.target.value })}
              >
                <option value="youtube">YouTube</option>
                <option value="podcast">Podcast</option>
                <option value="website">Website</option>
                <option value="pdf">PDF</option>
                <option value="course">Course</option>
                <option value="movie_series">Movie / Series</option>
              </select>
              <input
                required
                className={inputCls}
                placeholder="URL or local note reference *"
                value={resForm.url_or_path}
                onChange={(e) => setResForm({ ...resForm, url_or_path: e.target.value })}
              />
              <div className="flex flex-wrap gap-2">
                {SKILLS.map((sk) => (
                  <label key={sk} className="text-xs flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={resForm.skills.includes(sk)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...resForm.skills, sk]
                          : resForm.skills.filter((s) => s !== sk);
                        setResForm({ ...resForm, skills: next });
                      }}
                    />
                    {sk}
                  </label>
                ))}
              </div>
              <Button type="submit" variant="primary" size="sm">
                Save Resource
              </Button>
            </form>
          </Card>

          <Card className="md:col-span-8">
            <h3 className="text-sm font-semibold mb-3">English Resource Library</h3>
            {data.resources.length === 0 ? (
              <p className="text-sm text-slate-500">No English resources saved yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.resources.map((r: any) => (
                  <div key={r.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <LocalStorageLink pathOrUrl={r.url_or_path} label={r.title} className="text-sm font-medium" />
                      <div className="text-slate-500 mt-0.5">
                        {r.resource_type} · Skills: {JSON.parse(r.skills_json || '[]').join(', ') || 'General'}
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        await api.del(`/api/english/resources/${r.id}`);
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

      {tab === 'tutor' && (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-blue-600" />
                On-Device English Practice Coach (100% Offline)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Target Level: {aiStatus?.tutorLevel || 'B2'} · Mode: {aiStatus?.provider || 'On-Device Practice Coach'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                className={`${inputCls} w-auto text-xs`}
                value={tutorMode}
                onChange={(e) => setTutorMode(e.target.value)}
              >
                <option value="conversation">Daily Conversation</option>
                <option value="job_interview">Job Interview</option>
                <option value="tech_interview">Technical Interview</option>
                <option value="grammar_vocab">Grammar & Vocabulary Practice</option>
                <option value="roleplay">Role-Play Scenario</option>
              </select>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await api.del(`/api/ai/tutor/history?mode=${tutorMode}`);
                  setTutorMessages([]);
                }}
              >
                Clear Chat
              </Button>
            </div>
          </div>

          {aiStatus && !aiStatus.aiEnabled && (
            <div className="p-4 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/20 text-xs text-slate-700 dark:text-slate-200 space-y-1.5">
              <p className="font-semibold">Practice Coach Paused in Settings</p>
              <p>
                You toggled off the Practice Coach in Settings. Re-enable it anytime without internet required.
              </p>
              <button onClick={() => onNavigate('settings')} className="text-blue-600 hover:underline cursor-pointer">
                Open Settings →
              </button>
            </div>
          )}

          <div className="space-y-3 max-h-96 overflow-y-auto p-3 rounded-lg bg-slate-50/70 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800">
            {tutorMessages.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500">
                <MessageSquare className="w-6 h-6 mx-auto mb-2 opacity-40" />
                Start an offline practice drill below in <strong>{tutorMode.replace('_', ' ')}</strong> mode.
              </div>
            ) : (
              tutorMessages.map((m) => (
                <div
                  key={m.id}
                  className={`p-3 rounded-lg text-sm max-w-[85%] ${
                    m.role === 'user'
                      ? 'ml-auto bg-blue-600 text-white'
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{m.content}</div>
                </div>
              ))
            )}
          </div>

          {tutorError && <p className="text-xs text-red-600">{tutorError}</p>}

          <form onSubmit={sendTutorMessage} className="flex gap-2">
            <input
              className={inputCls}
              placeholder="Write your message in English..."
              value={tutorInput}
              onChange={(e) => setTutorInput(e.target.value)}
            />
            <Button type="submit" variant="primary" disabled={tutorSending || (aiStatus && !aiStatus.aiEnabled)}>
              <Send className="w-4 h-4" />
              {tutorSending ? 'Sending...' : 'Send'}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
