import { getLocalDb } from '../sqliteDriver.ts';
import { uid } from '../schema.ts';
import { LocalHttpError } from '../httpError.ts';
import { deleteStoredFile, saveUploadedFile } from '../fileStorage.ts';
import { calculateNextReviewSM2 } from '../../shared/logic.ts';

export async function getEnglishOverview() {
  const db = await getLocalDb();
  const today = new Date().toISOString().slice(0, 10);
  const dailyPlan = await db.all<Record<string, any>>('SELECT * FROM english_daily_plan ORDER BY id ASC');
  const normalizedPlan = dailyPlan.map((p) => ({
    ...p,
    completed_today: p.last_completed_date === today ? 1 : 0,
  }));
  const vocabulary = await db.all<Record<string, any>>('SELECT * FROM vocabulary_items ORDER BY created_at DESC');
  const recordings = await db.all('SELECT * FROM speaking_recordings ORDER BY created_at DESC');
  const cefr = await db.all('SELECT * FROM cefr_assessments ORDER BY assessed_at DESC');
  const resources = await db.all('SELECT * FROM english_resources ORDER BY created_at DESC');
  const writings = await db.all('SELECT * FROM writing_entries ORDER BY updated_at DESC');

  const dueVocabCount = vocabulary.filter((v) => v.next_review_date <= today && !v.mastered).length;

  return {
    dailyPlan: normalizedPlan,
    vocabulary,
    recordings,
    cefr,
    resources,
    writings,
    dueVocabCount,
  };
}

export async function createEnglishPlanItem(body: any) {
  const db = await getLocalDb();
  const { skill = 'speaking', title, target_minutes = 15 } = body ?? {};
  if (!title || !String(title).trim()) {
    throw new LocalHttpError(400, 'Plan item title is required.');
  }
  const id = uid('ep');
  await db.run(
    'INSERT INTO english_daily_plan (id, skill, title, target_minutes, completed_today) VALUES (?, ?, ?, ?, 0)',
    [id, skill, String(title).trim(), Math.max(1, Number(target_minutes))]
  );
  return { item: await db.get('SELECT * FROM english_daily_plan WHERE id = ?', [id]) };
}

export async function toggleEnglishPlanItem(id: string) {
  const db = await getLocalDb();
  const item = await db.get<Record<string, any>>('SELECT * FROM english_daily_plan WHERE id = ?', [id]);
  if (!item) throw new LocalHttpError(404, 'Plan item not found');
  const today = new Date().toISOString().slice(0, 10);
  const doneToday = item.last_completed_date === today;
  await db.run('UPDATE english_daily_plan SET completed_today = ?, last_completed_date = ? WHERE id = ?', [
    doneToday ? 0 : 1,
    doneToday ? null : today,
    id,
  ]);
  return { ok: true };
}

export async function deleteEnglishPlanItem(id: string) {
  await (await getLocalDb()).run('DELETE FROM english_daily_plan WHERE id = ?', [id]);
  return { ok: true };
}

export async function createVocabularyItem(body: any) {
  const db = await getLocalDb();
  const { word, meaning, part_of_speech = 'noun', example = '', tags = '' } = body ?? {};
  if (!word || !meaning) {
    throw new LocalHttpError(400, 'Word and meaning are required.');
  }
  const id = uid('voc');
  const today = new Date().toISOString().slice(0, 10);
  await db.run(
    `INSERT INTO vocabulary_items (id, word, meaning, part_of_speech, example, tags, next_review_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, String(word).trim(), String(meaning).trim(), part_of_speech, String(example), String(tags), today, new Date().toISOString()]
  );
  return { item: await db.get('SELECT * FROM vocabulary_items WHERE id = ?', [id]) };
}

export async function reviewVocabularyItem(id: string, body: any) {
  const db = await getLocalDb();
  const item = await db.get<Record<string, any>>('SELECT * FROM vocabulary_items WHERE id = ?', [id]);
  if (!item) throw new LocalHttpError(404, 'Vocabulary item not found');
  const { quality = 4 } = body ?? {};
  const today = new Date().toISOString().slice(0, 10);
  const next = calculateNextReviewSM2({
    quality: Number(quality),
    repetitions: Number(item.repetitions || 0),
    intervalDays: Number(item.interval_days || 0),
    easeFactor: Number(item.ease_factor || 2.5),
    todayStr: today,
  });
  const mastered = next.repetitions >= 4 && next.intervalDays >= 14 ? 1 : 0;
  await db.run(
    'UPDATE vocabulary_items SET repetitions = ?, interval_days = ?, ease_factor = ?, next_review_date = ?, mastered = ? WHERE id = ?',
    [next.repetitions, next.intervalDays, next.easeFactor, next.nextReviewDate, mastered, id]
  );
  return { item: await db.get('SELECT * FROM vocabulary_items WHERE id = ?', [id]), next };
}

export async function deleteVocabularyItem(id: string) {
  await (await getLocalDb()).run('DELETE FROM vocabulary_items WHERE id = ?', [id]);
  return { ok: true };
}

export async function createSpeakingRecording(body: FormData | Record<string, any>) {
  const db = await getLocalDb();
  let topic = 'Free Speaking Practice';
  let duration_seconds = 0;
  let mistake_notes = '';
  let transcript = '';
  let relPath = '';

  if (body instanceof FormData) {
    topic = String(body.get('topic') || 'Free Speaking Practice');
    duration_seconds = Number(body.get('duration_seconds') || 0);
    mistake_notes = String(body.get('mistake_notes') || '');
    transcript = String(body.get('transcript') || '');
    const audio = body.get('audio');
    if (!(audio instanceof Blob) || audio.size === 0) {
      throw new LocalHttpError(400, 'Audio recording file is required.');
    }
    const name = audio instanceof File && audio.name ? audio.name : `rec_${Date.now()}.webm`;
    relPath = await saveUploadedFile('recordings', audio, name);
  } else {
    throw new LocalHttpError(400, 'Audio recording file is required.');
  }

  const id = uid('rec');
  await db.run(
    `INSERT INTO speaking_recordings (id, topic, audio_path, duration_seconds, mistake_notes, transcript, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, topic.trim(), relPath, Math.round(duration_seconds), mistake_notes, transcript || null, new Date().toISOString()]
  );
  return { recording: await db.get('SELECT * FROM speaking_recordings WHERE id = ?', [id]) };
}

export async function updateSpeakingRecording(id: string, body: any) {
  const db = await getLocalDb();
  const { mistake_notes, transcript } = body ?? {};
  await db.run(
    'UPDATE speaking_recordings SET mistake_notes = COALESCE(?, mistake_notes), transcript = COALESCE(?, transcript) WHERE id = ?',
    [mistake_notes ?? null, transcript ?? null, id]
  );
  return { recording: await db.get('SELECT * FROM speaking_recordings WHERE id = ?', [id]) };
}

export async function deleteSpeakingRecording(id: string) {
  const db = await getLocalDb();
  const row = await db.get<{ audio_path: string }>('SELECT audio_path FROM speaking_recordings WHERE id = ?', [id]);
  if (row) {
    await deleteStoredFile(row.audio_path);
    await db.run('DELETE FROM speaking_recordings WHERE id = ?', [id]);
  }
  return { ok: true };
}

export async function createCefrAssessment(body: any) {
  const db = await getLocalDb();
  const {
    overall_level = 'B1',
    speaking = 'B1',
    listening = 'B1',
    reading = 'B1',
    writing = 'B1',
    vocabulary = 'B1',
    grammar = 'B1',
    notes = '',
    assessed_at = new Date().toISOString().slice(0, 10),
  } = body ?? {};
  const id = uid('cefr');
  await db.run(
    `INSERT INTO cefr_assessments (id, assessed_at, overall_level, speaking, listening, reading, writing, vocabulary, grammar, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, assessed_at, overall_level, speaking, listening, reading, writing, vocabulary, grammar, String(notes)]
  );
  return { assessment: await db.get('SELECT * FROM cefr_assessments WHERE id = ?', [id]) };
}

export async function createEnglishResource(body: any) {
  const db = await getLocalDb();
  const { title, resource_type = 'youtube', url_or_path, skills = [], notes = '' } = body ?? {};
  if (!title || !url_or_path) {
    throw new LocalHttpError(400, 'Title and URL/path are required.');
  }
  const id = uid('eres');
  await db.run(
    'INSERT INTO english_resources (id, title, resource_type, url_or_path, skills_json, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, String(title).trim(), resource_type, String(url_or_path).trim(), JSON.stringify(skills), String(notes), new Date().toISOString()]
  );
  return { resource: await db.get('SELECT * FROM english_resources WHERE id = ?', [id]) };
}

export async function deleteEnglishResource(id: string) {
  await (await getLocalDb()).run('DELETE FROM english_resources WHERE id = ?', [id]);
  return { ok: true };
}

export async function createWritingEntry(body: any) {
  const db = await getLocalDb();
  const { title, prompt = '', content = '', status = 'draft' } = body ?? {};
  if (!title || !String(title).trim()) {
    throw new LocalHttpError(400, 'Draft title is required.');
  }
  const id = uid('wrt');
  const words = String(content).trim() ? String(content).trim().split(/\s+/).length : 0;
  await db.run(
    'INSERT INTO writing_entries (id, title, prompt, content, word_count, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, String(title).trim(), String(prompt), String(content), words, status, new Date().toISOString()]
  );
  return { writing: await db.get('SELECT * FROM writing_entries WHERE id = ?', [id]) };
}

export async function updateWritingEntry(id: string, body: any) {
  const db = await getLocalDb();
  const existing = await db.get<Record<string, any>>('SELECT * FROM writing_entries WHERE id = ?', [id]);
  if (!existing) throw new LocalHttpError(404, 'Writing draft not found');
  const content = body?.content !== undefined ? String(body.content) : existing.content;
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  await db.run(
    'UPDATE writing_entries SET title = ?, prompt = ?, content = ?, word_count = ?, status = ?, updated_at = ? WHERE id = ?',
    [
      body?.title !== undefined ? String(body.title).trim() : existing.title,
      body?.prompt !== undefined ? String(body.prompt) : existing.prompt,
      content,
      words,
      body?.status ?? existing.status,
      new Date().toISOString(),
      id,
    ]
  );
  return { writing: await db.get('SELECT * FROM writing_entries WHERE id = ?', [id]) };
}

export async function deleteWritingEntry(id: string) {
  await (await getLocalDb()).run('DELETE FROM writing_entries WHERE id = ?', [id]);
  return { ok: true };
}
