import React, { useEffect, useState } from 'react';
import {
  BookMarked,
  CheckCircle2,
  Code2,
  FileUp,
  GraduationCap,
  Layers,
  Play,
  Plus,
  RefreshCw,
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
import { LocalStorageLink } from '../components/LocalStorageMedia.tsx';

export function StudyView({ onTimersChanged }: { onTimersChanged: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'courses' | 'reviews' | 'assessments'>('courses');
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);

  const [pathModal, setPathModal] = useState(false);
  const [courseModal, setCourseModal] = useState(false);
  const [pathForm, setPathForm] = useState({ title: '', description: '', target_hours: '' });
  const [courseForm, setCourseForm] = useState({ learning_path_id: '', title: '', provider: '', description: '', planned_hours: '' });
  const [moduleTitle, setModuleTitle] = useState('');
  const [topicDraft, setTopicDraft] = useState<Record<string, { title: string; kind: string }>>({});
  const [noteForm, setNoteForm] = useState({
    section_type: 'explanation',
    title: '',
    content: '',
    code_snippet: '',
  });
  const [noteAttachment, setNoteAttachment] = useState<File | null>(null);
  const [resForm, setResForm] = useState({ title: '', resource_type: 'youtube', url_or_path: '' });
  const [resFile, setResFile] = useState<File | null>(null);
  const [asmForm, setAsmForm] = useState({ course_id: '', title: '', score: '', max_score: '100', attempt_number: '1', notes: '' });
  const [reviewDateOverride, setReviewDateOverride] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    try {
      const res = await api.get<any>('/api/study');
      setData(res);
      if (!selectedCourseId && res.courses?.length > 0) {
        setSelectedCourseId(res.courses[0].id);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading || !data) return <LoadingRows count={5} />;

  const selectedCourse = data.courses.find((c: any) => c.id === selectedCourseId) ?? null;
  const courseModules = data.modules.filter((m: any) => m.course_id === selectedCourseId);
  const selectedTopic = data.topics.find((t: any) => t.id === selectedTopicId) ?? null;
  const topicNotes = data.notes.filter((n: any) => n.topic_id === selectedTopicId);
  const topicResources = data.resources.filter((r: any) => r.topic_id === selectedTopicId || (r.course_id === selectedCourseId && !r.topic_id));
  const today = new Date().toISOString().slice(0, 10);
  const dueTopics = data.topics.filter((t: any) => t.next_review_date && t.next_review_date <= today);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Study & Learning"
        subtitle="Learning Path → Course → Module → Topic → Structured Notes, Resources, Study Sessions, and Spaced Repetition."
        actions={
          <>
            <Button onClick={() => setPathModal(true)}>
              <Plus className="w-4 h-4" />
              New Learning Path
            </Button>
            <Button variant="primary" onClick={() => setCourseModal(true)}>
              <Plus className="w-4 h-4" />
              New Course
            </Button>
          </>
        }
      />

      {/* Analytics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card padding="p-4">
          <div className="text-xs text-slate-500">Total Study Hours</div>
          <div className="text-xl font-semibold font-mono tabular-nums mt-1">{data.analytics.totalStudyHours}h</div>
        </Card>
        <Card padding="p-4">
          <div className="text-xs text-slate-500">Topics Completed</div>
          <div className="text-xl font-semibold font-mono tabular-nums mt-1">
            {data.analytics.completedTopics} / {data.analytics.totalTopics}
          </div>
        </Card>
        <Card padding="p-4">
          <div className="text-xs text-slate-500">Courses Active</div>
          <div className="text-xl font-semibold font-mono tabular-nums mt-1">{data.courses.length}</div>
        </Card>
        <Card padding="p-4">
          <div className="text-xs text-slate-500">Spaced Reviews Due</div>
          <div className="text-xl font-semibold font-mono tabular-nums mt-1 text-blue-600 dark:text-blue-400">
            {dueTopics.length}
          </div>
        </Card>
      </div>

      <SegmentedTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'courses', label: 'Paths & Courses' },
          { id: 'reviews', label: 'Spaced Repetition Queue', count: dueTopics.length },
          { id: 'assessments', label: 'Assessments & Scores', count: data.assessments.length },
        ]}
      />

      {tab === 'courses' && (
        data.courses.length === 0 ? (
          <EmptyState
            icon={<GraduationCap className="w-8 h-8" />}
            title="No courses created yet"
            description="Create a Learning Path or Course to organize modules, topics, structured notes, resources, and spaced repetition."
            action={
              <Button variant="primary" onClick={() => setCourseModal(true)}>
                Create First Course
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left Tree: Paths & Courses */}
            <Card className="lg:col-span-4 space-y-4">
              {data.paths.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 mb-2">Learning Paths</h3>
                  <div className="space-y-1.5">
                    {data.paths.map((p: any) => (
                      <div key={p.id} className="text-xs p-2 rounded bg-slate-50 dark:bg-slate-800/60 flex justify-between">
                        <span className="font-medium">{p.title}</span>
                        <button
                          onClick={async () => {
                            await api.del(`/api/study/paths/${p.id}`);
                            load();
                          }}
                          className="text-slate-400 hover:text-red-600 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-xs font-semibold text-slate-500 mb-2">Courses</h3>
                <div className="space-y-2">
                  {data.courses.map((c: any) => {
                    const cTopics = data.topics.filter((t: any) => t.course_id === c.id);
                    const done = cTopics.filter((t: any) => t.status === 'completed').length;
                    const actualHrs = Number((cTopics.reduce((s: number, t: any) => s + Number(t.study_seconds || 0), 0) / 3600).toFixed(1));
                    return (
                      <button
                        key={c.id}
                        onClick={() => {
                          setSelectedCourseId(c.id);
                          setSelectedTopicId(null);
                        }}
                        className={`w-full text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                          selectedCourseId === c.id
                            ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/30'
                            : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{c.title}</div>
                        <div className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                          {c.provider || 'Self-study'} · {done}/{cTopics.length} topics · {actualHrs}h
                          {c.planned_hours ? ` / ${c.planned_hours}h planned` : ''}
                        </div>
                        {cTopics.length > 0 && (
                          <div className="mt-2">
                            <ProgressBar value={done} max={cTopics.length} />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </Card>

            {/* Right Workspace: Modules, Topics, & Selected Topic Notes */}
            <div className="lg:col-span-8 space-y-5">
              {selectedCourse && (
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                        {selectedCourse.title}
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">{selectedCourse.description || selectedCourse.provider}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={async () => {
                        await api.del(`/api/study/courses/${selectedCourse.id}`);
                        setSelectedCourseId(null);
                        load();
                      }}
                    >
                      Delete Course
                    </Button>
                  </div>

                  {/* Add Module */}
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!moduleTitle.trim()) return;
                      await api.post('/api/study/modules', {
                        course_id: selectedCourse.id,
                        title: moduleTitle.trim(),
                        sort_order: courseModules.length + 1,
                      });
                      setModuleTitle('');
                      load();
                    }}
                    className="flex gap-2 mt-4"
                  >
                    <input
                      className={inputCls}
                      placeholder="New module title..."
                      value={moduleTitle}
                      onChange={(e) => setModuleTitle(e.target.value)}
                    />
                    <Button type="submit" size="sm">
                      Add Module
                    </Button>
                  </form>

                  {/* Modules & Topics List */}
                  <div className="mt-4 space-y-4">
                    {courseModules.map((mod: any) => {
                      const modTopics = data.topics.filter((t: any) => t.module_id === mod.id);
                      const draft = topicDraft[mod.id] ?? { title: '', kind: 'lesson' };
                      return (
                        <div key={mod.id} className="border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold flex items-center gap-1.5">
                              <Layers className="w-4 h-4 text-slate-400" />
                              {mod.title}
                            </span>
                            <button
                              onClick={async () => {
                                await api.del(`/api/study/modules/${mod.id}`);
                                load();
                              }}
                              className="text-xs text-slate-400 hover:text-red-600 cursor-pointer"
                            >
                              Delete
                            </button>
                          </div>

                          <div className="divide-y divide-slate-100 dark:divide-slate-800">
                            {modTopics.map((top: any) => (
                              <div
                                key={top.id}
                                className={`py-2 flex flex-wrap items-center justify-between gap-2 px-2 rounded ${
                                  selectedTopicId === top.id ? 'bg-blue-50/70 dark:bg-blue-950/30' : ''
                                }`}
                              >
                                <button
                                  onClick={() => setSelectedTopicId(top.id)}
                                  className="text-left min-w-0 flex-1 cursor-pointer"
                                >
                                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                                    {top.title}
                                  </div>
                                  <div className="text-xs text-slate-500 font-mono tabular-nums">
                                    {top.topic_kind} · {top.status.replace('_', ' ')} · {Math.round((top.study_seconds || 0) / 60)}m studied
                                    {top.next_review_date ? ` · Next review ${top.next_review_date}` : ''}
                                  </div>
                                </button>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <select
                                    className={`${inputCls} w-auto py-1 text-xs`}
                                    value={top.status}
                                    onChange={async (e) => {
                                      await api.put(`/api/study/topics/${top.id}`, { status: e.target.value });
                                      load();
                                    }}
                                  >
                                    <option value="not_started">Not Started</option>
                                    <option value="in_progress">In Progress</option>
                                    <option value="completed">Completed</option>
                                    <option value="needs_revision">Needs Revision</option>
                                  </select>
                                  <Button
                                    size="sm"
                                    onClick={async () => {
                                      await api.post('/api/system/timers/start', {
                                        entity_type: 'study_topic',
                                        entity_id: top.id,
                                        entity_title: top.title,
                                      });
                                      onTimersChanged();
                                    }}
                                  >
                                    <Play className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button size="sm" onClick={() => setSelectedTopicId(top.id)}>
                                    Notes
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="flex gap-2 pt-1">
                            <input
                              className={`${inputCls} py-1.5 text-xs`}
                              placeholder="Add topic, lab, or assignment..."
                              value={draft.title}
                              onChange={(e) =>
                                setTopicDraft({ ...topicDraft, [mod.id]: { ...draft, title: e.target.value } })
                              }
                            />
                            <select
                              className={`${inputCls} w-28 py-1.5 text-xs`}
                              value={draft.kind}
                              onChange={(e) =>
                                setTopicDraft({ ...topicDraft, [mod.id]: { ...draft, kind: e.target.value } })
                              }
                            >
                              <option value="lesson">Lesson</option>
                              <option value="lab">Lab</option>
                              <option value="assignment">Assignment</option>
                            </select>
                            <Button
                              size="sm"
                              onClick={async () => {
                                if (!draft.title.trim()) return;
                                await api.post('/api/study/topics', {
                                  module_id: mod.id,
                                  course_id: selectedCourse.id,
                                  title: draft.title.trim(),
                                  topic_kind: draft.kind,
                                });
                                setTopicDraft({ ...topicDraft, [mod.id]: { title: '', kind: 'lesson' } });
                                load();
                              }}
                            >
                              Add
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}

              {/* Selected Topic Workspace: Structured Notes & Resources */}
              {selectedTopic && (
                <Card className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div>
                      <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">Topic Workspace</span>
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        {selectedTopic.title}
                      </h3>
                    </div>
                    <Button
                      size="sm"
                      onClick={async () => {
                        await api.post(`/api/study/topics/${selectedTopic.id}/review`, { quality: 4 });
                        load();
                      }}
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Schedule Next Review (SM-2)
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Structured Topic Notes */}
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold flex items-center gap-1.5">
                        <Code2 className="w-4 h-4 text-blue-600" />
                        Structured Notes & Code Blocks
                      </h4>
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (!noteForm.title.trim()) return;
                          const fd = new FormData();
                          fd.append('section_type', noteForm.section_type);
                          fd.append('title', noteForm.title.trim());
                          fd.append('content', noteForm.content);
                          if (noteForm.code_snippet) fd.append('code_snippet', noteForm.code_snippet);
                          if (noteAttachment) fd.append('attachment', noteAttachment);
                          await api.upload(`/api/study/topics/${selectedTopic.id}/notes`, fd);
                          setNoteForm({ section_type: 'explanation', title: '', content: '', code_snippet: '' });
                          setNoteAttachment(null);
                          load();
                        }}
                        className="space-y-2"
                      >
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            className={inputCls}
                            value={noteForm.section_type}
                            onChange={(e) => setNoteForm({ ...noteForm, section_type: e.target.value })}
                          >
                            <option value="explanation">Concept Explanation</option>
                            <option value="commands">Commands</option>
                            <option value="config">Config Example</option>
                            <option value="troubleshooting">Troubleshooting</option>
                            <option value="interview">Interview Questions</option>
                          </select>
                          <input
                            className={inputCls}
                            placeholder="Note heading..."
                            value={noteForm.title}
                            onChange={(e) => setNoteForm({ ...noteForm, title: e.target.value })}
                          />
                        </div>
                        <textarea
                          className={inputCls}
                          rows={2}
                          placeholder="Explanation or notes..."
                          value={noteForm.content}
                          onChange={(e) => setNoteForm({ ...noteForm, content: e.target.value })}
                        />
                        <textarea
                          className={`${inputCls} font-mono text-xs`}
                          rows={2}
                          placeholder="Optional command / config / code snippet..."
                          value={noteForm.code_snippet}
                          onChange={(e) => setNoteForm({ ...noteForm, code_snippet: e.target.value })}
                        />
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-xs text-slate-500 flex items-center gap-1 cursor-pointer">
                            <FileUp className="w-3.5 h-3.5" />
                            {noteAttachment ? noteAttachment.name : 'Attach image/file'}
                            <input
                              type="file"
                              className="hidden"
                              onChange={(e) => setNoteAttachment(e.target.files?.[0] ?? null)}
                            />
                          </label>
                          <Button type="submit" size="sm" variant="primary">
                            Save Note
                          </Button>
                        </div>
                      </form>

                      <div className="space-y-2.5 max-h-80 overflow-y-auto">
                        {topicNotes.map((n: any) => (
                          <div key={n.id} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
                            <div className="flex justify-between text-slate-500">
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                [{n.section_type}] {n.title}
                              </span>
                              <button
                                onClick={async () => {
                                  await api.del(`/api/study/notes/${n.id}`);
                                  load();
                                }}
                                className="hover:text-red-600 cursor-pointer"
                              >
                                Delete
                              </button>
                            </div>
                            {n.content && <p className="text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{n.content}</p>}
                            {n.code_snippet && (
                              <pre className="p-2 rounded bg-slate-900 text-slate-100 font-mono text-[11px] overflow-x-auto">
                                {n.code_snippet}
                              </pre>
                            )}
                            {n.attachment_path && (
                              <LocalStorageLink pathOrUrl={n.attachment_path} label="Open attachment" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Resources */}
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold flex items-center gap-1.5">
                        <BookMarked className="w-4 h-4 text-emerald-600" />
                        Attached Resources
                      </h4>
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (!resForm.title.trim()) return;
                          const fd = new FormData();
                          fd.append('course_id', selectedCourse.id);
                          fd.append('topic_id', selectedTopic.id);
                          fd.append('title', resForm.title.trim());
                          fd.append('resource_type', resForm.resource_type);
                          fd.append('url_or_path', resForm.url_or_path);
                          if (resFile) fd.append('file', resFile);
                          await api.upload('/api/study/resources', fd);
                          setResForm({ title: '', resource_type: 'youtube', url_or_path: '' });
                          setResFile(null);
                          load();
                        }}
                        className="space-y-2"
                      >
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            className={inputCls}
                            value={resForm.resource_type}
                            onChange={(e) => setResForm({ ...resForm, resource_type: e.target.value })}
                          >
                            <option value="youtube">YouTube</option>
                            <option value="udemy">Udemy / Coursera</option>
                            <option value="website">Website / Article</option>
                            <option value="pdf">PDF</option>
                            <option value="local_file">Local File</option>
                            <option value="lab">Practice Lab</option>
                          </select>
                          <input
                            className={inputCls}
                            placeholder="Resource title"
                            value={resForm.title}
                            onChange={(e) => setResForm({ ...resForm, title: e.target.value })}
                          />
                        </div>
                        <input
                          className={inputCls}
                          placeholder="URL (https://...) or upload local file below"
                          value={resForm.url_or_path}
                          onChange={(e) => setResForm({ ...resForm, url_or_path: e.target.value })}
                        />
                        <div className="flex items-center justify-between">
                          <label className="text-xs text-slate-500 cursor-pointer flex items-center gap-1">
                            <FileUp className="w-3.5 h-3.5" />
                            {resFile ? resFile.name : 'Or attach local file'}
                            <input
                              type="file"
                              className="hidden"
                              onChange={(e) => setResFile(e.target.files?.[0] ?? null)}
                            />
                          </label>
                          <Button type="submit" size="sm">
                            Add Resource
                          </Button>
                        </div>
                      </form>

                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {topicResources.map((r: any) => (
                          <div key={r.id} className="py-2 flex items-center justify-between text-xs gap-2">
                            <div className="min-w-0">
                              <LocalStorageLink
                                pathOrUrl={r.url_or_path}
                                label={`${r.title} (${r.resource_type})`}
                              />
                            </div>
                            <button
                              onClick={async () => {
                                await api.del(`/api/study/resources/${r.id}`);
                                load();
                              }}
                              className="text-slate-400 hover:text-red-600 ml-2 cursor-pointer shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          </div>
        )
      )}

      {tab === 'reviews' && (
        <Card>
          <h3 className="text-sm font-semibold mb-3">Spaced Repetition Queue (Accept or Edit Proposed Date)</h3>
          {dueTopics.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">
              No study topics are due for spaced repetition review today.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {dueTopics.map((t: any) => (
                <div key={t.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">{t.title}</div>
                    <div className="text-xs text-slate-500 font-mono">
                      Due {t.next_review_date} · Revisions: {t.revision_count}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      className={`${inputCls} w-auto py-1 text-xs`}
                      value={reviewDateOverride[t.id] || ''}
                      onChange={(e) => setReviewDateOverride({ ...reviewDateOverride, [t.id]: e.target.value })}
                      title="Optional custom next review date"
                    />
                    <Button
                      size="sm"
                      onClick={async () => {
                        await api.post(`/api/study/topics/${t.id}/review`, {
                          quality: 2,
                          custom_next_date: reviewDateOverride[t.id] || undefined,
                        });
                        load();
                      }}
                    >
                      Needs Revision
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={async () => {
                        await api.post(`/api/study/topics/${t.id}/review`, {
                          quality: 4,
                          custom_next_date: reviewDateOverride[t.id] || undefined,
                        });
                        load();
                      }}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Recalled Well
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'assessments' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          <Card className="md:col-span-5">
            <h3 className="text-sm font-semibold mb-3">Record Exam / Assessment Score</h3>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const courseId = asmForm.course_id || data.courses[0]?.id;
                if (!courseId || !asmForm.title || !asmForm.score) return;
                await api.post('/api/study/assessments', { ...asmForm, course_id: courseId });
                setAsmForm({ course_id: courseId, title: '', score: '', max_score: '100', attempt_number: '1', notes: '' });
                load();
              }}
              className="space-y-3"
            >
              <div>
                <label className={labelCls}>Course</label>
                <select
                  className={inputCls}
                  value={asmForm.course_id || data.courses[0]?.id || ''}
                  onChange={(e) => setAsmForm({ ...asmForm, course_id: e.target.value })}
                >
                  {data.courses.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Assessment Title</label>
                <input
                  required
                  className={inputCls}
                  value={asmForm.title}
                  onChange={(e) => setAsmForm({ ...asmForm, title: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={labelCls}>Score</label>
                  <input
                    type="number"
                    required
                    className={inputCls}
                    value={asmForm.score}
                    onChange={(e) => setAsmForm({ ...asmForm, score: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelCls}>Max</label>
                  <input
                    type="number"
                    className={inputCls}
                    value={asmForm.max_score}
                    onChange={(e) => setAsmForm({ ...asmForm, max_score: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelCls}>Attempt #</label>
                  <input
                    type="number"
                    min={1}
                    className={inputCls}
                    value={asmForm.attempt_number}
                    onChange={(e) => setAsmForm({ ...asmForm, attempt_number: e.target.value })}
                  />
                </div>
              </div>
              <Button type="submit" variant="primary" size="sm">
                Save Score
              </Button>
            </form>
          </Card>

          <Card className="md:col-span-7">
            <h3 className="text-sm font-semibold mb-3">Recorded Attempts</h3>
            {data.assessments.length === 0 ? (
              <p className="text-sm text-slate-500 py-6">No assessment scores recorded yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.assessments.map((a: any) => (
                  <div key={a.id} className="py-2.5 flex justify-between text-sm">
                    <div>
                      <div className="font-medium">{a.title}</div>
                      <div className="text-xs text-slate-500">
                        Attempt #{a.attempt_number} · {a.taken_at}
                      </div>
                    </div>
                    <span className="font-mono font-semibold tabular-nums">
                      {a.score} / {a.max_score}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* New Learning Path Modal */}
      <Modal open={pathModal} onClose={() => setPathModal(false)} title="Create Learning Path">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!pathForm.title.trim()) return;
            await api.post('/api/study/paths', pathForm);
            setPathForm({ title: '', description: '', target_hours: '' });
            setPathModal(false);
            load();
          }}
          className="space-y-4"
        >
          <div>
            <label className={labelCls}>Title *</label>
            <input
              required
              className={inputCls}
              value={pathForm.title}
              onChange={(e) => setPathForm({ ...pathForm, title: e.target.value })}
            />
          </div>
          <div>
            <label className={labelCls}>Target Hours</label>
            <input
              type="number"
              className={inputCls}
              value={pathForm.target_hours}
              onChange={(e) => setPathForm({ ...pathForm, target_hours: e.target.value })}
            />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea
              className={inputCls}
              rows={2}
              value={pathForm.description}
              onChange={(e) => setPathForm({ ...pathForm, description: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => setPathModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Create Path
            </Button>
          </div>
        </form>
      </Modal>

      {/* New Course Modal */}
      <Modal open={courseModal} onClose={() => setCourseModal(false)} title="Create Course">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!courseForm.title.trim()) return;
            const res = await api.post<{ course: any }>('/api/study/courses', courseForm);
            setCourseForm({ learning_path_id: '', title: '', provider: '', description: '', planned_hours: '' });
            setCourseModal(false);
            setSelectedCourseId(res.course.id);
            load();
          }}
          className="space-y-4"
        >
          <div>
            <label className={labelCls}>Learning Path (optional)</label>
            <select
              className={inputCls}
              value={courseForm.learning_path_id}
              onChange={(e) => setCourseForm({ ...courseForm, learning_path_id: e.target.value })}
            >
              <option value="">Standalone Course</option>
              {data.paths.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Course Title *</label>
            <input
              required
              className={inputCls}
              value={courseForm.title}
              onChange={(e) => setCourseForm({ ...courseForm, title: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Provider</label>
              <input
                className={inputCls}
                placeholder="Udemy, Coursera, Book..."
                value={courseForm.provider}
                onChange={(e) => setCourseForm({ ...courseForm, provider: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>Planned Hours</label>
              <input
                type="number"
                className={inputCls}
                value={courseForm.planned_hours}
                onChange={(e) => setCourseForm({ ...courseForm, planned_hours: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea
              className={inputCls}
              rows={2}
              value={courseForm.description}
              onChange={(e) => setCourseForm({ ...courseForm, description: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => setCourseModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Create Course
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
