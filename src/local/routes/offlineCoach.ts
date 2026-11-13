import { getLocalDb } from '../sqliteDriver.ts';
import { uid } from '../schema.ts';
import { LocalHttpError } from '../httpError.ts';

function generateOfflineCoachReply(mode: string, userMessage: string, level: string): string {
  const clean = userMessage.trim();
  const wordCount = clean.split(/\s+/).filter(Boolean).length;

  const starterMap: Record<string, string[]> = {
    conversation: [
      `Clear thought (${wordCount} words at ${level} pace). Try connecting your main point with a transition such as "On top of that," or "The main reason is..."`,
      `Follow-up question: What specific moment or example best illustrates what you just described?`,
    ],
    job_interview: [
      `Good answer structure (${wordCount} words). To make it sharper for an interview, frame it using STAR: Situation, Task, Action, and measurable Result.`,
      `Next prompt: Describe a trade-off you had to defend under time pressure and what outcome changed because of your decision.`,
    ],
    tech_interview: [
      `Solid explanation (${wordCount} words). Check if you stated concrete constraints (latency, offline resilience, storage limits, or failure recovery).`,
      `Next prompt: How would your design behave if local storage reached capacity or a write operation was interrupted mid-transaction?`,
    ],
    grammar_vocab: [
      `Quick review of your sentence (${wordCount} words): verify tense consistency and replace general verbs ("make", "do", "get") with precise verbs ("implement", "diagnose", "achieve").`,
      `Drill: Rewrite your message in one formal sentence and one natural spoken sentence, then save any new words to your Vocabulary deck.`,
    ],
    roleplay: [
      `Role-play response: "Thanks for explaining that clearly. Walk me through the next concrete step you recommend we take today."`,
      `Tip (${level}): Keep sentences concise and ask one clarifying question back to keep the dialogue flowing.`,
    ],
  };

  const parts = starterMap[mode] ?? starterMap.conversation;
  return `${parts[0]}\n\n${parts[1]}`;
}

export async function getCoachStatus() {
  const db = await getLocalDb();
  const settings = await db.get<{ ai_enabled: number; ai_tutor_level: string }>(
    'SELECT ai_enabled, ai_tutor_level FROM user_settings WHERE id = 1'
  );
  return {
    configured: true,
    offlineMode: true,
    aiEnabled: Boolean(settings?.ai_enabled ?? 1),
    tutorLevel: settings?.ai_tutor_level ?? 'B2',
    provider: 'On-Device Practice Coach (100% Offline)',
    model: 'local-structured-coach',
  };
}

export async function getTutorHistory(query: URLSearchParams) {
  const db = await getLocalDb();
  const mode = query.get('mode') || 'conversation';
  const rows = await db.all(
    'SELECT * FROM english_tutor_messages WHERE mode = ? ORDER BY created_at ASC LIMIT 100',
    [mode]
  );
  return { messages: rows };
}

export async function clearTutorHistory(query: URLSearchParams) {
  const db = await getLocalDb();
  const mode = query.get('mode') || 'conversation';
  await db.run('DELETE FROM english_tutor_messages WHERE mode = ?', [mode]);
  return { ok: true };
}

export async function postTutorChat(body: any) {
  const { mode = 'conversation', message, level = 'B2' } = body ?? {};
  if (!message || typeof message !== 'string' || !message.trim()) {
    throw new LocalHttpError(400, 'Message is required.');
  }

  const db = await getLocalDb();
  const settings = await db.get<{ ai_enabled: number }>('SELECT ai_enabled FROM user_settings WHERE id = 1');
  if (settings && !settings.ai_enabled) {
    throw new LocalHttpError(403, 'Practice coach features are currently disabled in Settings.');
  }

  const now = new Date().toISOString();
  await db.run(
    'INSERT INTO english_tutor_messages (id, mode, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
    [uid('msg'), mode, 'user', message.trim(), now]
  );

  const replyText = generateOfflineCoachReply(mode, message, level);
  const replyId = uid('msg');
  const replyAt = new Date().toISOString();
  await db.run(
    'INSERT INTO english_tutor_messages (id, mode, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
    [replyId, mode, 'assistant', replyText, replyAt]
  );

  return {
    reply: { id: replyId, mode, role: 'assistant', content: replyText, created_at: replyAt },
  };
}

export async function analyzeSpeakingRecording(body: any) {
  const { recordingId } = body ?? {};
  if (!recordingId || typeof recordingId !== 'string') {
    throw new LocalHttpError(400, 'recordingId is required.');
  }

  const db = await getLocalDb();
  const recording = await db.get<{
    id: string;
    topic: string;
    mistake_notes: string;
    transcript: string | null;
    duration_seconds: number;
  }>('SELECT * FROM speaking_recordings WHERE id = ?', [recordingId]);

  if (!recording) {
    throw new LocalHttpError(404, 'Recording not found.');
  }

  const durationNote =
    recording.duration_seconds < 20
      ? 'Short take (<20s) — aim for 45–90 seconds so you practice sustaining ideas with examples.'
      : `Good stamina (${recording.duration_seconds}s). Listen back once specifically for pauses and sentence endings.`;
  const mistakeReview = recording.mistake_notes?.trim()
    ? `Target focus from your notes ("${recording.mistake_notes.trim()}"): drill 3 corrected sentences out loud and add tricky words to Vocabulary.`
    : 'Add 1–2 self-observed notes after listening back to track recurring pronunciation or grammar patterns.';
  const feedback = `${durationNote} ${mistakeReview} Next drill: re-record "${recording.topic}" using two clear signposts ("First...", "For example...").`;

  await db.run('UPDATE speaking_recordings SET ai_feedback = ? WHERE id = ?', [feedback, recordingId]);
  return { feedback };
}
