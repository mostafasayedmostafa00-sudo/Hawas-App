import { getLocalDb } from '../sqliteDriver.ts';
import { uid } from '../schema.ts';
import { LocalHttpError } from '../httpError.ts';
import { deleteStoredFile, saveUploadedFile } from '../fileStorage.ts';
import { calculateReadingMetrics } from '../../shared/logic.ts';

export async function listBooks(query: URLSearchParams) {
  const db = await getLocalDb();
  const status = query.get('status') || '';
  const queue = query.get('queue') || '';
  const search = (query.get('search') || '').trim().toLowerCase();
  const sort = query.get('sort') || 'queue';

  let books = await db.all<Record<string, any>>('SELECT * FROM books');
  if (status && status !== 'all') books = books.filter((b) => b.status === status);
  if (queue && queue !== 'all') books = books.filter((b) => b.queue_bucket === queue);
  if (search) {
    books = books.filter(
      (b) =>
        String(b.title).toLowerCase().includes(search) ||
        String(b.author).toLowerCase().includes(search) ||
        String(b.category).toLowerCase().includes(search)
    );
  }

  if (sort === 'title') {
    books.sort((a, b) => String(a.title).localeCompare(String(b.title)));
  } else if (sort === 'recent') {
    books.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  } else if (sort === 'progress') {
    books.sort((a, b) => Number(b.progress_percent) - Number(a.progress_percent));
  } else {
    const rank: Record<string, number> = { NOW: 0, NEXT: 1, LATER: 2, NONE: 3 };
    books.sort((a, b) => {
      const r = (rank[String(a.queue_bucket)] ?? 9) - (rank[String(b.queue_bucket)] ?? 9);
      return r !== 0 ? r : Number(a.queue_order) - Number(b.queue_order);
    });
  }

  const files = await db.all<any>('SELECT * FROM book_files ORDER BY created_at DESC');
  const sessions = await db.all<{ book_id: string; duration_seconds: number; pages_read: number; started_at: string }>(
    'SELECT * FROM reading_sessions ORDER BY started_at DESC'
  );

  const today = new Date().toISOString().slice(0, 10);
  const enriched = books.map((b) => {
    const bookFiles = files.filter((f) => f.book_id === b.id);
    const bookSessions = sessions.filter((s) => s.book_id === b.id);
    const totalMinutesRead = Math.round(
      bookSessions.reduce((sum, s) => sum + Number(s.duration_seconds || 0), 0) / 60
    );
    const totalPagesLogged = bookSessions.reduce((sum, s) => sum + Number(s.pages_read || 0), 0);
    const metrics = calculateReadingMetrics({
      totalPages: b.total_pages === null ? null : Number(b.total_pages),
      currentPage: Number(b.current_page || 0),
      targetFinishDate: b.target_finish_date ? String(b.target_finish_date) : null,
      todayStr: today,
      totalMinutesRead,
      totalPagesLogged,
      manualPercent: Number(b.progress_percent || 0),
    });
    return { ...b, files: bookFiles, metrics, totalMinutesRead };
  });

  const finishedRow = await db.get<{ c: number }>("SELECT COUNT(*) as c FROM books WHERE status = 'finished'");
  const finishedCount = finishedRow?.c ?? 0;
  const totalPagesRead = sessions.reduce((s, x) => s + Number(x.pages_read || 0), 0);
  const totalReadingMinutes = Math.round(sessions.reduce((s, x) => s + Number(x.duration_seconds || 0), 0) / 60);

  const activeDays = new Set(sessions.map((s) => s.started_at.slice(0, 10)));
  let streakDays = 0;
  const cursor = new Date();
  for (let i = 0; i < 365; i++) {
    const dStr = cursor.toISOString().slice(0, 10);
    if (activeDays.has(dStr)) {
      streakDays += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else if (i === 0) {
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  const avgPagesPerDay = activeDays.size > 0 ? Number((totalPagesRead / activeDays.size).toFixed(1)) : 0;

  return {
    books: enriched,
    stats: {
      finishedCount,
      totalPagesRead,
      totalReadingMinutes,
      streakDays,
      avgPagesPerDay,
      activeReadingDays: activeDays.size,
    },
  };
}

export async function getBookDetail(id: string) {
  const db = await getLocalDb();
  const book = await db.get('SELECT * FROM books WHERE id = ?', [id]);
  if (!book) throw new LocalHttpError(404, 'Book not found');

  const files = await db.all('SELECT * FROM book_files WHERE book_id = ? ORDER BY created_at DESC', [id]);
  const sessions = await db.all('SELECT * FROM reading_sessions WHERE book_id = ? ORDER BY started_at DESC', [id]);
  const highlights = await db.all('SELECT * FROM book_highlights WHERE book_id = ? ORDER BY created_at DESC', [id]);
  const notes = await db.all('SELECT * FROM book_notes WHERE book_id = ? ORDER BY created_at DESC', [id]);
  const bookmarks = await db.all('SELECT * FROM book_bookmarks WHERE book_id = ? ORDER BY created_at DESC', [id]);
  return { book, files, sessions, highlights, notes, bookmarks };
}

export async function createBook(body: any) {
  const db = await getLocalDb();
  const {
    title,
    author = '',
    category = 'General',
    description = '',
    external_link = null,
    status = 'want_to_read',
    queue_bucket = 'LATER',
    total_pages = null,
    current_page = 0,
    target_finish_date = null,
  } = body ?? {};

  if (!title || typeof title !== 'string' || !title.trim()) {
    throw new LocalHttpError(400, 'Book title is required.');
  }

  let effectiveQueue = queue_bucket;
  if (effectiveQueue === 'NOW') {
    const existingNow = await db.get("SELECT id FROM books WHERE queue_bucket = 'NOW' LIMIT 1");
    if (existingNow) effectiveQueue = 'NEXT';
  }

  const now = new Date().toISOString();
  const id = uid('book');
  const parsedTotal = total_pages !== null && total_pages !== '' && Number(total_pages) > 0 ? Number(total_pages) : null;
  const parsedCurrent = Math.max(0, Number(current_page || 0));
  const progress = parsedTotal ? Math.min(100, Math.round((parsedCurrent / parsedTotal) * 100)) : 0;

  await db.run(
    `INSERT INTO books (
      id, title, author, category, description, external_link, status, queue_bucket,
      queue_order, total_pages, current_page, progress_percent, target_finish_date, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      title.trim(),
      String(author).trim(),
      String(category).trim() || 'General',
      String(description).trim(),
      external_link ? String(external_link).trim() : null,
      status,
      effectiveQueue,
      Date.now(),
      parsedTotal,
      parsedCurrent,
      progress,
      target_finish_date || null,
      now,
      now,
    ]
  );

  return {
    book: await db.get('SELECT * FROM books WHERE id = ?', [id]),
    queueDemotedFromNow: queue_bucket === 'NOW' && effectiveQueue === 'NEXT',
  };
}

export async function updateBook(id: string, body: any) {
  const db = await getLocalDb();
  const existing = await db.get<Record<string, any>>('SELECT * FROM books WHERE id = ?', [id]);
  if (!existing) throw new LocalHttpError(404, 'Book not found');

  const b = body ?? {};
  const totalPages =
    b.total_pages !== undefined
      ? b.total_pages === null || b.total_pages === '' || Number(b.total_pages) <= 0
        ? null
        : Number(b.total_pages)
      : existing.total_pages;
  const currentPage = b.current_page !== undefined ? Math.max(0, Number(b.current_page)) : existing.current_page;
  let progressPercent =
    b.progress_percent !== undefined ? Math.max(0, Math.min(100, Number(b.progress_percent))) : existing.progress_percent;
  if (totalPages && (b.current_page !== undefined || b.total_pages !== undefined)) {
    progressPercent = Math.min(100, Math.round((currentPage / totalPages) * 100));
  }
  if (b.status === 'finished') progressPercent = 100;

  const now = new Date().toISOString();
  await db.run(
    `UPDATE books SET
      title = ?, author = ?, category = ?, description = ?, external_link = ?,
      status = ?, queue_bucket = ?, queue_order = ?, total_pages = ?, current_page = ?,
      current_location = ?, progress_percent = ?, target_finish_date = ?, updated_at = ?
    WHERE id = ?`,
    [
      b.title !== undefined ? String(b.title).trim() : existing.title,
      b.author !== undefined ? String(b.author).trim() : existing.author,
      b.category !== undefined ? String(b.category).trim() : existing.category,
      b.description !== undefined ? String(b.description) : existing.description,
      b.external_link !== undefined ? b.external_link || null : existing.external_link,
      b.status ?? existing.status,
      b.queue_bucket ?? existing.queue_bucket,
      b.queue_order ?? existing.queue_order,
      totalPages,
      currentPage,
      b.current_location !== undefined ? b.current_location : existing.current_location,
      progressPercent,
      b.target_finish_date !== undefined ? b.target_finish_date || null : existing.target_finish_date,
      now,
      id,
    ]
  );

  return { book: await db.get('SELECT * FROM books WHERE id = ?', [id]) };
}

export async function deleteBook(id: string) {
  const db = await getLocalDb();
  const files = await db.all<{ storage_path: string }>('SELECT storage_path FROM book_files WHERE book_id = ?', [id]);
  for (const f of files) {
    await deleteStoredFile(f.storage_path);
  }
  const book = await db.get<{ cover_path: string | null }>('SELECT cover_path FROM books WHERE id = ?', [id]);
  if (book?.cover_path) await deleteStoredFile(book.cover_path);
  await db.run('DELETE FROM books WHERE id = ?', [id]);
  return { ok: true };
}

export async function uploadBookFile(bookId: string, formData: FormData) {
  const db = await getLocalDb();
  const book = await db.get('SELECT id FROM books WHERE id = ?', [bookId]);
  const file = formData.get('file');
  if (!book || !(file instanceof File)) {
    throw new LocalHttpError(400, 'Book or file missing.');
  }
  const lower = file.name.toLowerCase();
  const fileType = lower.endsWith('.pdf') ? 'pdf' : lower.endsWith('.epub') ? 'epub' : 'other';
  const relPath = await saveUploadedFile('books', file, file.name);
  const id = uid('bf');
  await db.run(
    'INSERT INTO book_files (id, book_id, file_name, file_type, storage_path, file_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, bookId, file.name, fileType, relPath, file.size, new Date().toISOString()]
  );
  return { file: await db.get('SELECT * FROM book_files WHERE id = ?', [id]) };
}

export async function deleteBookFile(fileId: string) {
  const db = await getLocalDb();
  const f = await db.get<{ storage_path: string }>('SELECT storage_path FROM book_files WHERE id = ?', [fileId]);
  if (f) {
    await deleteStoredFile(f.storage_path);
    await db.run('DELETE FROM book_files WHERE id = ?', [fileId]);
  }
  return { ok: true };
}

export async function uploadBookCover(bookId: string, formData: FormData) {
  const db = await getLocalDb();
  const file = formData.get('cover');
  if (!(file instanceof File)) throw new LocalHttpError(400, 'Cover image missing.');
  const relPath = await saveUploadedFile('covers', file, file.name);
  await db.run('UPDATE books SET cover_path = ?, updated_at = ? WHERE id = ?', [
    relPath,
    new Date().toISOString(),
    bookId,
  ]);
  return { cover_path: relPath };
}

export async function logReadingSession(bookId: string, body: any) {
  const db = await getLocalDb();
  const book = await db.get<Record<string, any>>('SELECT * FROM books WHERE id = ?', [bookId]);
  if (!book) throw new LocalHttpError(404, 'Book not found');

  const { duration_minutes = 0, start_page = book.current_page, end_page = book.current_page, pages_read, notes = '', current_location } =
    body ?? {};
  const sPage = Math.max(0, Number(start_page));
  const ePage = Math.max(0, Number(end_page));
  const computedPages = pages_read !== undefined ? Math.max(0, Number(pages_read)) : Math.max(0, ePage - sPage);
  const now = new Date().toISOString();
  const durationSeconds = Math.max(0, Math.round(Number(duration_minutes) * 60));
  const id = uid('rs');

  await db.run(
    `INSERT INTO reading_sessions (id, book_id, started_at, ended_at, duration_seconds, start_page, end_page, pages_read, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, bookId, now, now, durationSeconds, sPage, ePage, computedPages, String(notes), now]
  );

  const newPage = Math.max(Number(book.current_page || 0), ePage);
  const progressPercent = book.total_pages
    ? Math.min(100, Math.round((newPage / Number(book.total_pages)) * 100))
    : book.progress_percent;

  await db.run(
    `UPDATE books SET current_page = ?, current_location = COALESCE(?, current_location), progress_percent = ?, status = CASE WHEN status = 'want_to_read' THEN 'reading' ELSE status END, updated_at = ? WHERE id = ?`,
    [newPage, current_location ?? null, progressPercent, now, bookId]
  );

  return { session: await db.get('SELECT * FROM reading_sessions WHERE id = ?', [id]) };
}

export async function addHighlight(bookId: string, body: any) {
  const db = await getLocalDb();
  const { page_or_location = '', excerpt, color = 'amber' } = body ?? {};
  if (!excerpt || !String(excerpt).trim()) throw new LocalHttpError(400, 'Highlight excerpt is required.');
  const id = uid('hl');
  await db.run(
    'INSERT INTO book_highlights (id, book_id, page_or_location, excerpt, color, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, bookId, String(page_or_location), String(excerpt).trim(), color, new Date().toISOString()]
  );
  return { highlight: await db.get('SELECT * FROM book_highlights WHERE id = ?', [id]) };
}

export async function deleteHighlight(hlId: string) {
  await (await getLocalDb()).run('DELETE FROM book_highlights WHERE id = ?', [hlId]);
  return { ok: true };
}

export async function addBookNote(bookId: string, body: any) {
  const db = await getLocalDb();
  const { note_type = 'note', page_or_location = '', content } = body ?? {};
  if (!content || !String(content).trim()) throw new LocalHttpError(400, 'Note content is required.');
  const id = uid('bn');
  await db.run(
    'INSERT INTO book_notes (id, book_id, note_type, page_or_location, content, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, bookId, note_type, String(page_or_location), String(content).trim(), new Date().toISOString()]
  );
  return { note: await db.get('SELECT * FROM book_notes WHERE id = ?', [id]) };
}

export async function deleteBookNote(noteId: string) {
  await (await getLocalDb()).run('DELETE FROM book_notes WHERE id = ?', [noteId]);
  return { ok: true };
}

export async function addBookmark(bookId: string, body: any) {
  const db = await getLocalDb();
  const { label, page_or_location } = body ?? {};
  if (!label || !page_or_location) {
    throw new LocalHttpError(400, 'Bookmark label and page/location are required.');
  }
  const id = uid('bm');
  await db.run(
    'INSERT INTO book_bookmarks (id, book_id, label, page_or_location, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, bookId, String(label).trim(), String(page_or_location).trim(), new Date().toISOString()]
  );
  return { bookmark: await db.get('SELECT * FROM book_bookmarks WHERE id = ?', [id]) };
}

export async function deleteBookmark(bmId: string) {
  await (await getLocalDb()).run('DELETE FROM book_bookmarks WHERE id = ?', [bmId]);
  return { ok: true };
}
