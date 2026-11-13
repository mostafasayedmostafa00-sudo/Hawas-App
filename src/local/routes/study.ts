import { getLocalDb } from '../sqliteDriver.ts';
import { uid } from '../schema.ts';
import { LocalHttpError } from '../httpError.ts';
import { deleteStoredFile, saveUploadedFile } from '../fileStorage.ts';
import { calculateNextReviewSM2 } from '../../shared/logic.ts';

export async function getStudyOverview() {
  const db = await getLocalDb();
  const paths = await db.all('SELECT * FROM learning_paths ORDER BY created_at DESC');
  const courses = await db.all('SELECT * FROM courses ORDER BY created_at DESC');
  const modules = await db.all('SELECT * FROM course_modules ORDER BY sort_order ASC');
  const topics = await db.all<Record<string, any>>('SELECT * FROM study_topics ORDER BY created_at ASC');
  const resources = await db.all('SELECT * FROM learning_resources ORDER BY created_at DESC');
  const notes = await db.all('SELECT * FROM topic_notes ORDER BY updated_at DESC');
  const sessions = await db.all('SELECT * FROM study_sessions ORDER BY started_at DESC');
  const assessments = await db.all('SELECT * FROM assessments ORDER BY taken_at DESC');

  const totalStudySeconds = topics.reduce((s, t) => s + Number(t.study_seconds || 0), 0);
  const completedTopics = topics.filter((t) => t.status === 'completed').length;
  const today = new Date().toISOString().slice(0, 10);
  const dueReviews = topics.filter((t) => t.next_review_date && t.next_review_date <= today);

  return {
    paths,
    courses,
    modules,
    topics,
    resources,
    notes,
    sessions,
    assessments,
    analytics: {
      totalStudyHours: Number((totalStudySeconds / 3600).toFixed(1)),
      completedTopics,
      totalTopics: topics.length,
      dueReviewCount: dueReviews.length,
    },
  };
}

export async function createPath(body: any) {
  const db = await getLocalDb();
  const { title, description = '', target_hours = null } = body ?? {};
  if (!title || !String(title).trim()) throw new LocalHttpError(400, 'Learning path title is required.');
  const id = uid('lp');
  await db.run(
    'INSERT INTO learning_paths (id, title, description, target_hours, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, String(title).trim(), String(description), target_hours ? Number(target_hours) : null, new Date().toISOString()]
  );
  return { path: await db.get('SELECT * FROM learning_paths WHERE id = ?', [id]) };
}

export async function deletePath(id: string) {
  await (await getLocalDb()).run('DELETE FROM learning_paths WHERE id = ?', [id]);
  return { ok: true };
}

export async function createCourse(body: any) {
  const db = await getLocalDb();
  const { learning_path_id = null, title, provider = '', description = '', planned_hours = null } = body ?? {};
  if (!title || !String(title).trim()) throw new LocalHttpError(400, 'Course title is required.');
  const id = uid('crs');
  await db.run(
    'INSERT INTO courses (id, learning_path_id, title, provider, description, planned_hours, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      id,
      learning_path_id || null,
      String(title).trim(),
      String(provider),
      String(description),
      planned_hours ? Number(planned_hours) : null,
      new Date().toISOString(),
    ]
  );
  return { course: await db.get('SELECT * FROM courses WHERE id = ?', [id]) };
}

export async function deleteCourse(id: string) {
  await (await getLocalDb()).run('DELETE FROM courses WHERE id = ?', [id]);
  return { ok: true };
}

export async function createModule(body: any) {
  const db = await getLocalDb();
  const { course_id, title, sort_order = 0 } = body ?? {};
  if (!course_id || !title || !String(title).trim()) {
    throw new LocalHttpError(400, 'course_id and module title are required.');
  }
  const id = uid('mod');
  await db.run('INSERT INTO course_modules (id, course_id, title, sort_order) VALUES (?, ?, ?, ?)', [
    id,
    course_id,
    String(title).trim(),
    Number(sort_order),
  ]);
  return { module: await db.get('SELECT * FROM course_modules WHERE id = ?', [id]) };
}

export async function deleteModule(id: string) {
  await (await getLocalDb()).run('DELETE FROM course_modules WHERE id = ?', [id]);
  return { ok: true };
}

export async function createTopic(body: any) {
  const db = await getLocalDb();
  const { module_id, course_id, title, topic_kind = 'lesson', planned_minutes = null } = body ?? {};
  if (!module_id || !course_id || !title || !String(title).trim()) {
    throw new LocalHttpError(400, 'module_id, course_id, and title are required.');
  }
  const id = uid('top');
  await db.run(
    'INSERT INTO study_topics (id, module_id, course_id, title, topic_kind, planned_minutes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      id,
      module_id,
      course_id,
      String(title).trim(),
      topic_kind,
      planned_minutes ? Number(planned_minutes) : null,
      new Date().toISOString(),
    ]
  );
  return { topic: await db.get('SELECT * FROM study_topics WHERE id = ?', [id]) };
}

export async function updateTopic(id: string, body: any) {
  const db = await getLocalDb();
  const existing = await db.get<Record<string, any>>('SELECT * FROM study_topics WHERE id = ?', [id]);
  if (!existing) throw new LocalHttpError(404, 'Topic not found');
  const b = body ?? {};
  await db.run(
    `UPDATE study_topics SET
      title = ?, topic_kind = ?, status = ?, next_review_date = ?, planned_minutes = ?
    WHERE id = ?`,
    [
      b.title !== undefined ? String(b.title).trim() : existing.title,
      b.topic_kind ?? existing.topic_kind,
      b.status ?? existing.status,
      b.next_review_date !== undefined ? b.next_review_date || null : existing.next_review_date,
      b.planned_minutes !== undefined ? (b.planned_minutes ? Number(b.planned_minutes) : null) : existing.planned_minutes,
      id,
    ]
  );
  return { topic: await db.get('SELECT * FROM study_topics WHERE id = ?', [id]) };
}

export async function reviewTopic(id: string, body: any) {
  const db = await getLocalDb();
  const topic = await db.get<Record<string, any>>('SELECT * FROM study_topics WHERE id = ?', [id]);
  if (!topic) throw new LocalHttpError(404, 'Topic not found');

  const { quality = 4, custom_next_date } = body ?? {};
  const today = new Date().toISOString().slice(0, 10);
  const proposal = calculateNextReviewSM2({
    quality: Number(quality),
    repetitions: Number(topic.revision_count || 0),
    intervalDays: Number(topic.interval_days || 0),
    easeFactor: Number(topic.ease_factor || 2.5),
    todayStr: today,
  });
  const finalDate = custom_next_date || proposal.nextReviewDate;

  await db.run(
    `UPDATE study_topics SET
      revision_count = ?, interval_days = ?, ease_factor = ?, next_review_date = ?,
      last_studied_at = ?, status = CASE WHEN ? >= 3 THEN 'completed' ELSE 'needs_revision' END
    WHERE id = ?`,
    [
      proposal.repetitions,
      proposal.intervalDays,
      proposal.easeFactor,
      finalDate,
      new Date().toISOString(),
      Number(quality),
      id,
    ]
  );

  return { topic: await db.get('SELECT * FROM study_topics WHERE id = ?', [id]), proposal };
}

export async function deleteTopic(id: string) {
  await (await getLocalDb()).run('DELETE FROM study_topics WHERE id = ?', [id]);
  return { ok: true };
}

export async function createTopicNote(topicId: string, body: FormData | Record<string, any>) {
  const db = await getLocalDb();
  let section_type = 'explanation';
  let title = '';
  let content = '';
  let code_snippet: string | null = null;
  let relAttach: string | null = null;

  if (body instanceof FormData) {
    section_type = String(body.get('section_type') || 'explanation');
    title = String(body.get('title') || '');
    content = String(body.get('content') || '');
    const rawCode = body.get('code_snippet');
    code_snippet = rawCode ? String(rawCode) : null;
    const file = body.get('attachment');
    if (file instanceof File && file.size > 0) {
      relAttach = await saveUploadedFile('attachments', file, file.name);
    }
  } else {
    section_type = body?.section_type || 'explanation';
    title = String(body?.title || '');
    content = String(body?.content || '');
    code_snippet = body?.code_snippet || null;
  }

  if (!title.trim()) throw new LocalHttpError(400, 'Note title is required.');
  const id = uid('tn');
  await db.run(
    'INSERT INTO topic_notes (id, topic_id, section_type, title, content, code_snippet, attachment_path, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, topicId, section_type, title.trim(), content, code_snippet, relAttach, new Date().toISOString()]
  );
  return { note: await db.get('SELECT * FROM topic_notes WHERE id = ?', [id]) };
}

export async function deleteTopicNote(noteId: string) {
  const db = await getLocalDb();
  const note = await db.get<{ attachment_path: string | null }>('SELECT attachment_path FROM topic_notes WHERE id = ?', [noteId]);
  if (note?.attachment_path) await deleteStoredFile(note.attachment_path);
  await db.run('DELETE FROM topic_notes WHERE id = ?', [noteId]);
  return { ok: true };
}

export async function createStudyResource(body: FormData | Record<string, any>) {
  const db = await getLocalDb();
  let course_id: string | null = null;
  let topic_id: string | null = null;
  let title = '';
  let resource_type = 'website';
  let finalPath = '';

  if (body instanceof FormData) {
    course_id = body.get('course_id') ? String(body.get('course_id')) : null;
    topic_id = body.get('topic_id') ? String(body.get('topic_id')) : null;
    title = String(body.get('title') || '');
    resource_type = String(body.get('resource_type') || 'website');
    const urlOrPath = String(body.get('url_or_path') || '').trim();
    const file = body.get('file');
    if (file instanceof File && file.size > 0) {
      finalPath = await saveUploadedFile('attachments', file, file.name);
    } else {
      finalPath = urlOrPath;
    }
  } else {
    course_id = body?.course_id || null;
    topic_id = body?.topic_id || null;
    title = String(body?.title || '');
    resource_type = String(body?.resource_type || 'website');
    finalPath = String(body?.url_or_path || '').trim();
  }

  if (!title.trim() || !finalPath) {
    throw new LocalHttpError(400, 'Resource title and URL or file are required.');
  }
  const id = uid('res');
  await db.run(
    'INSERT INTO learning_resources (id, course_id, topic_id, title, resource_type, url_or_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, course_id, topic_id, title.trim(), resource_type, finalPath, new Date().toISOString()]
  );
  return { resource: await db.get('SELECT * FROM learning_resources WHERE id = ?', [id]) };
}

export async function deleteStudyResource(id: string) {
  const db = await getLocalDb();
  const row = await db.get<{ url_or_path: string }>('SELECT url_or_path FROM learning_resources WHERE id = ?', [id]);
  if (row && row.url_or_path.startsWith('attachments/')) {
    await deleteStoredFile(row.url_or_path);
  }
  await db.run('DELETE FROM learning_resources WHERE id = ?', [id]);
  return { ok: true };
}

export async function logStudySession(topicId: string, body: any) {
  const db = await getLocalDb();
  const { duration_minutes = 0, notes = '' } = body ?? {};
  const secs = Math.max(0, Math.round(Number(duration_minutes) * 60));
  const now = new Date().toISOString();
  const id = uid('ss');
  await db.run(
    'INSERT INTO study_sessions (id, topic_id, started_at, ended_at, duration_seconds, notes) VALUES (?, ?, ?, ?, ?, ?)',
    [id, topicId, now, now, secs, String(notes)]
  );
  await db.run(
    `UPDATE study_topics SET study_seconds = study_seconds + ?, last_studied_at = ?, status = CASE WHEN status = 'not_started' THEN 'in_progress' ELSE status END WHERE id = ?`,
    [secs, now, topicId]
  );
  return { session: await db.get('SELECT * FROM study_sessions WHERE id = ?', [id]) };
}

export async function createAssessment(body: any) {
  const db = await getLocalDb();
  const { course_id, title, score, max_score = 100, attempt_number = 1, taken_at = new Date().toISOString().slice(0, 10), notes = '' } =
    body ?? {};
  if (!course_id || !title || score === undefined) {
    throw new LocalHttpError(400, 'course_id, title, and score are required.');
  }
  const id = uid('asm');
  await db.run(
    'INSERT INTO assessments (id, course_id, title, score, max_score, attempt_number, taken_at, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, course_id, String(title).trim(), Number(score), Number(max_score), Number(attempt_number), taken_at, String(notes)]
  );
  return { assessment: await db.get('SELECT * FROM assessments WHERE id = ?', [id]) };
}
