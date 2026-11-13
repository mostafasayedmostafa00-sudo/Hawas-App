import React, { useEffect, useState } from 'react';
import {
  Bookmark,
  BookOpen,
  ExternalLink,
  FileText,
  Highlighter,
  Play,
  Plus,
  Search,
  StickyNote,
  Trash2,
  Upload,
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
import { LocalEpubViewer, LocalPdfViewer, LocalStorageLink } from '../components/LocalStorageMedia.tsx';
import type { Book, BookBookmark, BookFile, BookHighlight, BookNote, ReadingSession } from '../shared/types.ts';

export function BooksView({ onTimersChanged }: { onTimersChanged: () => void }) {
  const [books, setBooks] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [queueFilter, setQueueFilter] = useState('all');
  const [sortBy, setSortBy] = useState('queue');
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    book: Book;
    files: BookFile[];
    sessions: ReadingSession[];
    highlights: BookHighlight[];
    notes: BookNote[];
    bookmarks: BookBookmark[];
  } | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'reader' | 'notes' | 'sessions'>('overview');
  const [activeReaderFile, setActiveReaderFile] = useState<BookFile | null>(null);
  const [form, setForm] = useState({
    title: '',
    author: '',
    category: 'General',
    description: '',
    external_link: '',
    status: 'want_to_read',
    queue_bucket: 'LATER',
    total_pages: '',
    target_finish_date: '',
  });
  const [sessionForm, setSessionForm] = useState({ duration_minutes: '25', end_page: '', notes: '' });
  const [highlightForm, setHighlightForm] = useState({ page_or_location: '', excerpt: '' });
  const [noteForm, setNoteForm] = useState({ note_type: 'note', page_or_location: '', content: '' });
  const [bookmarkForm, setBookmarkForm] = useState({ label: '', page_or_location: '' });
  const [notice, setNotice] = useState('');

  async function loadLibrary() {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        status: statusFilter,
        queue: queueFilter,
        sort: sortBy,
        search,
      });
      const res = await api.get<{ books: any[]; stats: any }>(`/api/books?${qs}`);
      setBooks(res.books);
      setStats(res.stats);
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(id: string) {
    const res = await api.get<any>(`/api/books/${id}`);
    setDetail(res);
    setSessionForm({
      duration_minutes: '25',
      end_page: String(res.book.current_page ?? 0),
      notes: '',
    });
    if (res.files?.length > 0 && !activeReaderFile) {
      setActiveReaderFile(res.files[0]);
    }
  }

  useEffect(() => {
    loadLibrary();
  }, [statusFilter, queueFilter, sortBy, search]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId]);

  async function createBook(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    const res = await api.post<{ book: Book; queueDemotedFromNow: boolean }>('/api/books', {
      ...form,
      total_pages: form.total_pages ? Number(form.total_pages) : null,
    });
    if (res.queueDemotedFromNow) {
      setNotice('Another book is already in NOW, so the new book was placed in NEXT without replacing your current book.');
    }
    setAddOpen(false);
    setForm({
      title: '',
      author: '',
      category: 'General',
      description: '',
      external_link: '',
      status: 'want_to_read',
      queue_bucket: 'LATER',
      total_pages: '',
      target_finish_date: '',
    });
    loadLibrary();
  }

  async function updateBookField(patch: Partial<Book>) {
    if (!detail) return;
    await api.put(`/api/books/${detail.book.id}`, patch);
    await loadDetail(detail.book.id);
    loadLibrary();
  }

  async function uploadBookFile(e: React.ChangeEvent<HTMLInputElement>) {
    if (!detail || !e.target.files?.[0]) return;
    const fd = new FormData();
    fd.append('file', e.target.files[0]);
    await api.upload(`/api/books/${detail.book.id}/files`, fd);
    await loadDetail(detail.book.id);
    loadLibrary();
  }

  async function logReadingSession(e: React.FormEvent) {
    e.preventDefault();
    if (!detail) return;
    await api.post(`/api/books/${detail.book.id}/sessions`, {
      duration_minutes: Number(sessionForm.duration_minutes || 0),
      start_page: detail.book.current_page,
      end_page: Number(sessionForm.end_page || detail.book.current_page),
      notes: sessionForm.notes,
    });
    await loadDetail(detail.book.id);
    loadLibrary();
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Books & Reading"
        subtitle="Manage your on-device library, PDF/EPUB files, NOW/NEXT/LATER reading queue, sessions, highlights, and reading velocity."
        actions={
          <Button variant="primary" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4" />
            Add Book
          </Button>
        }
      />

      {notice && (
        <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-xs text-blue-800 dark:text-blue-200 flex justify-between">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="underline cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* Stats Strip */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Card padding="p-4">
            <div className="text-xs text-slate-500">Books Finished</div>
            <div className="text-xl font-semibold font-mono tabular-nums mt-1">{stats.finishedCount}</div>
          </Card>
          <Card padding="p-4">
            <div className="text-xs text-slate-500">Total Pages Read</div>
            <div className="text-xl font-semibold font-mono tabular-nums mt-1">{stats.totalPagesRead}</div>
          </Card>
          <Card padding="p-4">
            <div className="text-xs text-slate-500">Reading Time</div>
            <div className="text-xl font-semibold font-mono tabular-nums mt-1">{stats.totalReadingMinutes}m</div>
          </Card>
          <Card padding="p-4">
            <div className="text-xs text-slate-500">Current Streak</div>
            <div className="text-xl font-semibold font-mono tabular-nums mt-1">{stats.streakDays}d</div>
          </Card>
          <Card padding="p-4">
            <div className="text-xs text-slate-500">Avg Pages / Active Day</div>
            <div className="text-xl font-semibold font-mono tabular-nums mt-1">{stats.avgPagesPerDay}</div>
          </Card>
        </div>
      )}

      {/* Filters & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedTabs
            value={queueFilter}
            onChange={setQueueFilter}
            tabs={[
              { id: 'all', label: 'All Queues' },
              { id: 'NOW', label: 'NOW' },
              { id: 'NEXT', label: 'NEXT' },
              { id: 'LATER', label: 'LATER' },
            ]}
          />
          <select
            className={`${inputCls} w-auto`}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="want_to_read">Want to Read</option>
            <option value="reading">Reading</option>
            <option value="paused">Paused</option>
            <option value="finished">Finished</option>
            <option value="dropped">Dropped</option>
          </select>
          <select
            className={`${inputCls} w-auto`}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="queue">Sort: Queue</option>
            <option value="recent">Sort: Recently Updated</option>
            <option value="progress">Sort: Progress</option>
            <option value="title">Sort: Title</option>
          </select>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            className={`${inputCls} pl-9`}
            placeholder="Search books..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Library Grid */}
      {loading ? (
        <LoadingRows count={4} />
      ) : books.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="w-8 h-8" />}
          title="Your library is empty"
          description="Add a book to track your reading queue (NOW / NEXT / LATER), import local PDF or EPUB files, and record reading sessions."
          action={
            <Button variant="primary" onClick={() => setAddOpen(true)}>
              Add Your First Book
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {books.map((b) => (
            <Card key={b.id} className="flex flex-col justify-between">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {b.queue_bucket} · {b.status.replace(/_/g, ' ')} · {b.category}
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mt-1">
                  {b.title}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {b.author || 'Unknown author'}
                </p>

                <div className="mt-4 space-y-1.5">
                  <div className="flex justify-between text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
                    <span>
                      {b.total_pages
                        ? `Page ${b.current_page} / ${b.total_pages}`
                        : `Page ${b.current_page} (pages unknown)`}
                    </span>
                    <span>{b.metrics?.progressPercent !== null ? `${b.metrics.progressPercent}%` : `${b.totalMinutesRead}m`}</span>
                  </div>
                  <ProgressBar value={b.metrics?.progressPercent ?? 0} />
                  {b.metrics?.suggestedPagesPerDay && (
                    <div className="text-xs text-slate-500 font-mono tabular-nums">
                      Target: {b.metrics.suggestedPagesPerDay} pages/day until {b.target_finish_date}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                <span className="text-xs text-slate-500 font-mono tabular-nums">
                  {b.files?.length || 0} file(s)
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={async () => {
                      await api.post('/api/system/timers/start', {
                        entity_type: 'book',
                        entity_id: b.id,
                        entity_title: b.title,
                      });
                      onTimersChanged();
                    }}
                  >
                    <Play className="w-3.5 h-3.5" />
                    Read Timer
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      setActiveReaderFile(null);
                      setDetailTab('overview');
                      setSelectedId(b.id);
                    }}
                  >
                    Open
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add Book Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Book to Library">
        <form onSubmit={createBook} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Title *</label>
              <input
                required
                className={inputCls}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>Author</label>
              <input
                className={inputCls}
                value={form.author}
                onChange={(e) => setForm({ ...form, author: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>Category / Genre</label>
              <input
                className={inputCls}
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>Reading Queue</label>
              <select
                className={inputCls}
                value={form.queue_bucket}
                onChange={(e) => setForm({ ...form, queue_bucket: e.target.value })}
              >
                <option value="LATER">LATER</option>
                <option value="NEXT">NEXT</option>
                <option value="NOW">NOW (if empty)</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Total Pages (blank if unknown/EPUB)</label>
              <input
                type="number"
                min={1}
                className={inputCls}
                value={form.total_pages}
                onChange={(e) => setForm({ ...form, total_pages: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>Target Finish Date</label>
              <input
                type="date"
                className={inputCls}
                value={form.target_finish_date}
                onChange={(e) => setForm({ ...form, target_finish_date: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>External Book Link (optional)</label>
            <input
              className={inputCls}
              placeholder="https://..."
              value={form.external_link}
              onChange={(e) => setForm({ ...form, external_link: e.target.value })}
            />
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
            <Button type="button" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Add Book
            </Button>
          </div>
        </form>
      </Modal>

      {/* Book Detail & In-App Reader Modal */}
      <Modal
        open={Boolean(selectedId && detail)}
        onClose={() => {
          setSelectedId(null);
          setDetail(null);
        }}
        title={detail?.book.title || 'Book Details'}
        maxWidth="max-w-5xl"
      >
        {detail && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SegmentedTabs
                value={detailTab}
                onChange={setDetailTab}
                tabs={[
                  { id: 'overview', label: 'Overview & Files' },
                  { id: 'reader', label: `In-App Reader (${detail.files.length})` },
                  { id: 'notes', label: `Highlights & Notes (${detail.highlights.length + detail.notes.length})` },
                  { id: 'sessions', label: `Sessions (${detail.sessions.length})` },
                ]}
              />
              <div className="flex items-center gap-2">
                <select
                  className={`${inputCls} w-auto text-xs`}
                  value={detail.book.status}
                  onChange={(e) => updateBookField({ status: e.target.value as any })}
                >
                  <option value="want_to_read">Want to Read</option>
                  <option value="reading">Reading</option>
                  <option value="paused">Paused</option>
                  <option value="finished">Finished</option>
                  <option value="dropped">Dropped</option>
                </select>
                <select
                  className={`${inputCls} w-auto text-xs`}
                  value={detail.book.queue_bucket}
                  onChange={(e) => updateBookField({ queue_bucket: e.target.value as any })}
                >
                  <option value="NOW">Queue: NOW</option>
                  <option value="NEXT">Queue: NEXT</option>
                  <option value="LATER">Queue: LATER</option>
                  <option value="NONE">Queue: NONE</option>
                </select>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={async () => {
                    await api.del(`/api/books/${detail.book.id}`);
                    setSelectedId(null);
                    setDetail(null);
                    loadLibrary();
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {detailTab === 'overview' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-4">
                  <div className="text-sm text-slate-600 dark:text-slate-300">
                    {detail.book.description || 'No description added.'}
                  </div>
                  {detail.book.external_link && (
                    <a
                      href={detail.book.external_link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open external book link
                    </a>
                  )}
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div>
                      <label className={labelCls}>Current Page</label>
                      <input
                        type="number"
                        className={inputCls}
                        value={detail.book.current_page}
                        onChange={(e) => updateBookField({ current_page: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Target Finish Date</label>
                      <input
                        type="date"
                        className={inputCls}
                        value={detail.book.target_finish_date || ''}
                        onChange={(e) => updateBookField({ target_finish_date: e.target.value || null })}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold">On-Device Files (PDF / EPUB)</h4>
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      Import PDF / EPUB
                      <input
                        type="file"
                        accept=".pdf,.epub,application/pdf,application/epub+zip"
                        className="hidden"
                        onChange={uploadBookFile}
                      />
                    </label>
                  </div>
                  {detail.files.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      No local files attached yet. Import one or more PDF/EPUB files to store inside device storage and read completely offline.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                      {detail.files.map((f) => (
                        <div key={f.id} className="p-2.5 flex items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                            <span className="truncate font-medium">{f.file_name}</span>
                            <span className="text-slate-400 font-mono">
                              {(f.file_size / 1024).toFixed(0)} KB
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Button
                              size="sm"
                              onClick={() => {
                                setActiveReaderFile(f);
                                setDetailTab('reader');
                              }}
                            >
                              Read
                            </Button>
                            <button
                              onClick={async () => {
                                await api.del(`/api/books/files/${f.id}`);
                                if (activeReaderFile?.id === f.id) setActiveReaderFile(null);
                                loadDetail(detail.book.id);
                              }}
                              className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {detailTab === 'reader' && (
              <div className="space-y-3">
                {detail.files.length === 0 ? (
                  <p className="text-sm text-slate-500 py-8 text-center">
                    Import a PDF or EPUB file in the Overview tab to open it inside the app.
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      {detail.files.map((f) => (
                        <Button
                          key={f.id}
                          size="sm"
                          variant={activeReaderFile?.id === f.id ? 'primary' : 'secondary'}
                          onClick={() => setActiveReaderFile(f)}
                        >
                          {f.file_name}
                        </Button>
                      ))}
                    </div>
                    {activeReaderFile && activeReaderFile.file_type === 'pdf' && (
                      <LocalPdfViewer
                        storagePath={activeReaderFile.storage_path}
                        initialPage={detail.book.current_page || 1}
                        onPageChange={(page, totalPages) => {
                          const needsTotal = totalPages > 0 && !detail.book.total_pages;
                          if (page !== detail.book.current_page || needsTotal) {
                            const patch: Partial<Book> = { current_page: page };
                            if (needsTotal) patch.total_pages = totalPages;
                            api.put(`/api/books/${detail.book.id}`, patch).then(() => loadLibrary());
                          }
                        }}
                      />
                    )}
                    {activeReaderFile && activeReaderFile.file_type === 'epub' && (
                      <LocalEpubViewer
                        storagePath={activeReaderFile.storage_path}
                        initialLocation={detail.book.current_location}
                        onLocationChange={(cfi, pct) => {
                          api.put(`/api/books/${detail.book.id}`, {
                            current_location: cfi,
                            progress_percent: pct,
                          });
                        }}
                      />
                    )}
                    {activeReaderFile && activeReaderFile.file_type === 'other' && (
                      <div className="p-6 rounded-lg border border-slate-200 dark:border-slate-700 text-center space-y-2 text-xs">
                        <p className="text-slate-500">
                          Inline preview is available for PDF and EPUB files. Open this attachment using your device viewer:
                        </p>
                        <LocalStorageLink pathOrUrl={activeReaderFile.storage_path} label={activeReaderFile.file_name} />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {detailTab === 'notes' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Highlights */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-1.5">
                    <Highlighter className="w-4 h-4 text-amber-600" />
                    Highlights
                  </h4>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!highlightForm.excerpt.trim()) return;
                      await api.post(`/api/books/${detail.book.id}/highlights`, highlightForm);
                      setHighlightForm({ page_or_location: '', excerpt: '' });
                      loadDetail(detail.book.id);
                    }}
                    className="space-y-2"
                  >
                    <input
                      className={inputCls}
                      placeholder="Page / location (e.g. p. 42)"
                      value={highlightForm.page_or_location}
                      onChange={(e) => setHighlightForm({ ...highlightForm, page_or_location: e.target.value })}
                    />
                    <textarea
                      className={inputCls}
                      rows={2}
                      placeholder="Highlighted excerpt..."
                      value={highlightForm.excerpt}
                      onChange={(e) => setHighlightForm({ ...highlightForm, excerpt: e.target.value })}
                    />
                    <Button type="submit" size="sm">
                      Save Highlight
                    </Button>
                  </form>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {detail.highlights.map((h) => (
                      <div key={h.id} className="p-2.5 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-900/50 text-xs">
                        <div className="flex justify-between text-slate-500 mb-1">
                          <span className="font-mono">{h.page_or_location || 'Location'}</span>
                          <button
                            onClick={async () => {
                              await api.del(`/api/books/highlights/${h.id}`);
                              loadDetail(detail.book.id);
                            }}
                            className="hover:text-red-600 cursor-pointer"
                          >
                            Delete
                          </button>
                        </div>
                        <p className="text-slate-800 dark:text-slate-200">{h.excerpt}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Notes / Ideas / Quotes / Questions */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-1.5">
                    <StickyNote className="w-4 h-4 text-blue-600" />
                    Notes, Ideas, Quotes & Questions
                  </h4>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!noteForm.content.trim()) return;
                      await api.post(`/api/books/${detail.book.id}/notes`, noteForm);
                      setNoteForm({ note_type: 'note', page_or_location: '', content: '' });
                      loadDetail(detail.book.id);
                    }}
                    className="space-y-2"
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        className={inputCls}
                        value={noteForm.note_type}
                        onChange={(e) => setNoteForm({ ...noteForm, note_type: e.target.value })}
                      >
                        <option value="note">Note</option>
                        <option value="idea">Idea</option>
                        <option value="quote">Quote</option>
                        <option value="question">Question</option>
                      </select>
                      <input
                        className={inputCls}
                        placeholder="Page / loc"
                        value={noteForm.page_or_location}
                        onChange={(e) => setNoteForm({ ...noteForm, page_or_location: e.target.value })}
                      />
                    </div>
                    <textarea
                      className={inputCls}
                      rows={2}
                      placeholder="Write note, idea, or question..."
                      value={noteForm.content}
                      onChange={(e) => setNoteForm({ ...noteForm, content: e.target.value })}
                    />
                    <Button type="submit" size="sm">
                      Save Note
                    </Button>
                  </form>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {detail.notes.map((n) => (
                      <div key={n.id} className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
                        <div className="flex justify-between text-slate-500 mb-1">
                          <span>
                            {n.note_type} · {n.page_or_location || 'General'}
                          </span>
                          <button
                            onClick={async () => {
                              await api.del(`/api/books/notes/${n.id}`);
                              loadDetail(detail.book.id);
                            }}
                            className="hover:text-red-600 cursor-pointer"
                          >
                            Delete
                          </button>
                        </div>
                        <p className="text-slate-800 dark:text-slate-200">{n.content}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bookmarks */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-1.5">
                    <Bookmark className="w-4 h-4 text-emerald-600" />
                    Bookmarks
                  </h4>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!bookmarkForm.label || !bookmarkForm.page_or_location) return;
                      await api.post(`/api/books/${detail.book.id}/bookmarks`, bookmarkForm);
                      setBookmarkForm({ label: '', page_or_location: '' });
                      loadDetail(detail.book.id);
                    }}
                    className="space-y-2"
                  >
                    <input
                      className={inputCls}
                      placeholder="Bookmark label"
                      value={bookmarkForm.label}
                      onChange={(e) => setBookmarkForm({ ...bookmarkForm, label: e.target.value })}
                    />
                    <input
                      className={inputCls}
                      placeholder="Page or section"
                      value={bookmarkForm.page_or_location}
                      onChange={(e) => setBookmarkForm({ ...bookmarkForm, page_or_location: e.target.value })}
                    />
                    <Button type="submit" size="sm">
                      Add Bookmark
                    </Button>
                  </form>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {detail.bookmarks.map((bm) => (
                      <div key={bm.id} className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs flex justify-between items-center">
                        <div>
                          <div className="font-medium">{bm.label}</div>
                          <div className="font-mono text-slate-500">{bm.page_or_location}</div>
                        </div>
                        <button
                          onClick={async () => {
                            await api.del(`/api/books/bookmarks/${bm.id}`);
                            loadDetail(detail.book.id);
                          }}
                          className="text-slate-400 hover:text-red-600 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {detailTab === 'sessions' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <form onSubmit={logReadingSession} className="space-y-3">
                  <h4 className="text-sm font-semibold">Log Reading Session Manually</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Duration (minutes)</label>
                      <input
                        type="number"
                        min={1}
                        className={inputCls}
                        value={sessionForm.duration_minutes}
                        onChange={(e) => setSessionForm({ ...sessionForm, duration_minutes: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Ending Page</label>
                      <input
                        type="number"
                        min={0}
                        className={inputCls}
                        value={sessionForm.end_page}
                        onChange={(e) => setSessionForm({ ...sessionForm, end_page: e.target.value })}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Session Notes</label>
                    <textarea
                      className={inputCls}
                      rows={2}
                      value={sessionForm.notes}
                      onChange={(e) => setSessionForm({ ...sessionForm, notes: e.target.value })}
                    />
                  </div>
                  <Button type="submit" variant="primary" size="sm">
                    Save Reading Session
                  </Button>
                </form>

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Session History</h4>
                  {detail.sessions.length === 0 ? (
                    <p className="text-xs text-slate-500">No sessions recorded yet.</p>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
                      {detail.sessions.map((s) => (
                        <div key={s.id} className="py-2 text-xs">
                          <div className="flex justify-between font-mono tabular-nums">
                            <span>{s.started_at.slice(0, 10)}</span>
                            <span>
                              {Math.round(s.duration_seconds / 60)}m · +{s.pages_read} pages
                            </span>
                          </div>
                          {s.notes && <p className="text-slate-500 mt-0.5">{s.notes}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
