import { LocalHttpError } from './httpError.ts';
import {
  createException,
  createWeeklyBlock,
  deleteWeeklyBlock,
  getAnalytics,
  getCalendarEvents,
  getDashboard,
  getWeeklyBlocks,
  globalSearch,
  postNowNext,
} from './routes/dashboard.ts';
import {
  addBookmark,
  addBookNote,
  addHighlight,
  createBook,
  deleteBook,
  deleteBookFile,
  deleteBookmark,
  deleteBookNote,
  deleteHighlight,
  getBookDetail,
  listBooks,
  logReadingSession,
  updateBook,
  uploadBookCover,
  uploadBookFile,
} from './routes/books.ts';
import {
  createHabit,
  createTask,
  deleteHabit,
  deleteTask,
  listHabits,
  listTasks,
  logHabit,
  taskOverdueAction,
  updateTask,
} from './routes/tasks.ts';
import {
  createAssessment,
  createCourse,
  createModule,
  createPath,
  createStudyResource,
  createTopic,
  createTopicNote,
  deleteCourse,
  deleteModule,
  deletePath,
  deleteStudyResource,
  deleteTopic,
  deleteTopicNote,
  getStudyOverview,
  logStudySession,
  reviewTopic,
  updateTopic,
} from './routes/study.ts';
import {
  createCefrAssessment,
  createEnglishPlanItem,
  createEnglishResource,
  createSpeakingRecording,
  createVocabularyItem,
  createWritingEntry,
  deleteEnglishPlanItem,
  deleteEnglishResource,
  deleteSpeakingRecording,
  deleteVocabularyItem,
  deleteWritingEntry,
  getEnglishOverview,
  reviewVocabularyItem,
  toggleEnglishPlanItem,
  updateSpeakingRecording,
  updateWritingEntry,
} from './routes/english.ts';
import {
  approveGoalRevision,
  createExercise,
  createGoal,
  createGoalLink,
  createMeasurement,
  createMilestone,
  createWorkoutCategory,
  createWorkoutSession,
  deleteGoal,
  deleteGoalLink,
  deleteMilestone,
  deleteWorkoutSession,
  getFitnessOverview,
  listGoals,
  saveRecoveryLog,
  toggleMilestone,
  updateGoal,
} from './routes/goalsFitness.ts';
import {
  buildFullJsonExport,
  clearSampleDataRoute,
  createBackupSnapshot,
  deleteTimer,
  downloadBackupSnapshot,
  getSettings,
  importFullJsonBackup,
  listBackups,
  listNotifications,
  listTimers,
  loadSampleDataRoute,
  markNotificationRead,
  pauseTimer,
  restoreBackupSnapshot,
  resumeTimer,
  startTimer,
  stopTimer,
  updateSettings,
} from './routes/system.ts';
import {
  analyzeSpeakingRecording,
  clearTutorHistory,
  getCoachStatus,
  getTutorHistory,
  postTutorChat,
} from './routes/offlineCoach.ts';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

function jsonClone<T>(val: T): T {
  return JSON.parse(JSON.stringify(val));
}

export async function dispatchLocalApi<T = unknown>(
  method: HttpMethod,
  rawUrl: string,
  body?: unknown
): Promise<T> {
  const [pathname, queryStr = ''] = rawUrl.split('?');
  const query = new URLSearchParams(queryStr);

  const result = await routeRequest(method, pathname, query, body);
  return jsonClone(result) as T;
}

async function routeRequest(
  method: HttpMethod,
  p: string,
  query: URLSearchParams,
  body?: unknown
): Promise<unknown> {
  // Health
  if (method === 'GET' && p === '/api/health') {
    return { status: 'ok', mode: 'android-offline', timestamp: new Date().toISOString() };
  }

  // Dashboard, Search, Calendar, Analytics
  if (method === 'GET' && p === '/api/dashboard') return getDashboard(query);
  if (method === 'POST' && p === '/api/dashboard/now-next') return postNowNext(body);
  if (method === 'GET' && p === '/api/dashboard/weekly-blocks') return getWeeklyBlocks();
  if (method === 'POST' && p === '/api/dashboard/weekly-blocks') return createWeeklyBlock(body);
  let m = p.match(/^\/api\/dashboard\/weekly-blocks\/([^/]+)$/);
  if (m && method === 'DELETE') return deleteWeeklyBlock(m[1]);
  if (method === 'POST' && p === '/api/dashboard/exceptions') return createException(body);
  if (method === 'GET' && p === '/api/dashboard/search') return globalSearch(query);
  if (method === 'GET' && p === '/api/dashboard/calendar') return getCalendarEvents(query);
  if (method === 'GET' && p === '/api/dashboard/analytics') return getAnalytics(query);

  // Books & Reading
  if (method === 'GET' && p === '/api/books') return listBooks(query);
  if (method === 'POST' && p === '/api/books') return createBook(body);

  m = p.match(/^\/api\/books\/files\/([^/]+)$/);
  if (m && method === 'DELETE') return deleteBookFile(m[1]);
  m = p.match(/^\/api\/books\/highlights\/([^/]+)$/);
  if (m && method === 'DELETE') return deleteHighlight(m[1]);
  m = p.match(/^\/api\/books\/notes\/([^/]+)$/);
  if (m && method === 'DELETE') return deleteBookNote(m[1]);
  m = p.match(/^\/api\/books\/bookmarks\/([^/]+)$/);
  if (m && method === 'DELETE') return deleteBookmark(m[1]);

  m = p.match(/^\/api\/books\/([^/]+)\/files$/);
  if (m && method === 'POST') return uploadBookFile(m[1], body as FormData);
  m = p.match(/^\/api\/books\/([^/]+)\/cover$/);
  if (m && method === 'POST') return uploadBookCover(m[1], body as FormData);
  m = p.match(/^\/api\/books\/([^/]+)\/sessions$/);
  if (m && method === 'POST') return logReadingSession(m[1], body);
  m = p.match(/^\/api\/books\/([^/]+)\/highlights$/);
  if (m && method === 'POST') return addHighlight(m[1], body);
  m = p.match(/^\/api\/books\/([^/]+)\/notes$/);
  if (m && method === 'POST') return addBookNote(m[1], body);
  m = p.match(/^\/api\/books\/([^/]+)\/bookmarks$/);
  if (m && method === 'POST') return addBookmark(m[1], body);

  m = p.match(/^\/api\/books\/([^/]+)$/);
  if (m && method === 'GET') return getBookDetail(m[1]);
  if (m && method === 'PUT') return updateBook(m[1], body);
  if (m && method === 'DELETE') return deleteBook(m[1]);

  // Tasks & Habits
  if (method === 'GET' && p === '/api/tasks') return listTasks();
  if (method === 'POST' && p === '/api/tasks') return createTask(body);
  if (method === 'GET' && p === '/api/tasks/habits/all') return listHabits();
  if (method === 'POST' && p === '/api/tasks/habits') return createHabit(body);
  m = p.match(/^\/api\/tasks\/habits\/([^/]+)\/log$/);
  if (m && method === 'POST') return logHabit(m[1], body);
  m = p.match(/^\/api\/tasks\/habits\/([^/]+)$/);
  if (m && method === 'DELETE') return deleteHabit(m[1]);
  m = p.match(/^\/api\/tasks\/([^/]+)\/overdue-action$/);
  if (m && method === 'POST') return taskOverdueAction(m[1], body);
  m = p.match(/^\/api\/tasks\/([^/]+)$/);
  if (m && method === 'PUT') return updateTask(m[1], body);
  if (m && method === 'DELETE') return deleteTask(m[1]);

  // Study & Learning
  if (method === 'GET' && p === '/api/study') return getStudyOverview();
  if (method === 'POST' && p === '/api/study/paths') return createPath(body);
  m = p.match(/^\/api\/study\/paths\/([^/]+)$/);
  if (m && method === 'DELETE') return deletePath(m[1]);
  if (method === 'POST' && p === '/api/study/courses') return createCourse(body);
  m = p.match(/^\/api\/study\/courses\/([^/]+)$/);
  if (m && method === 'DELETE') return deleteCourse(m[1]);
  if (method === 'POST' && p === '/api/study/modules') return createModule(body);
  m = p.match(/^\/api\/study\/modules\/([^/]+)$/);
  if (m && method === 'DELETE') return deleteModule(m[1]);
  if (method === 'POST' && p === '/api/study/topics') return createTopic(body);
  m = p.match(/^\/api\/study\/topics\/([^/]+)\/review$/);
  if (m && method === 'POST') return reviewTopic(m[1], body);
  m = p.match(/^\/api\/study\/topics\/([^/]+)\/notes$/);
  if (m && method === 'POST') return createTopicNote(m[1], body as any);
  m = p.match(/^\/api\/study\/topics\/([^/]+)\/sessions$/);
  if (m && method === 'POST') return logStudySession(m[1], body);
  m = p.match(/^\/api\/study\/topics\/([^/]+)$/);
  if (m && method === 'PUT') return updateTopic(m[1], body);
  if (m && method === 'DELETE') return deleteTopic(m[1]);
  m = p.match(/^\/api\/study\/notes\/([^/]+)$/);
  if (m && method === 'DELETE') return deleteTopicNote(m[1]);
  if (method === 'POST' && p === '/api/study/resources') return createStudyResource(body as any);
  m = p.match(/^\/api\/study\/resources\/([^/]+)$/);
  if (m && method === 'DELETE') return deleteStudyResource(m[1]);
  if (method === 'POST' && p === '/api/study/assessments') return createAssessment(body);

  // English Learning
  if (method === 'GET' && p === '/api/english') return getEnglishOverview();
  if (method === 'POST' && p === '/api/english/plan') return createEnglishPlanItem(body);
  m = p.match(/^\/api\/english\/plan\/([^/]+)\/toggle$/);
  if (m && method === 'POST') return toggleEnglishPlanItem(m[1]);
  m = p.match(/^\/api\/english\/plan\/([^/]+)$/);
  if (m && method === 'DELETE') return deleteEnglishPlanItem(m[1]);
  if (method === 'POST' && p === '/api/english/vocabulary') return createVocabularyItem(body);
  m = p.match(/^\/api\/english\/vocabulary\/([^/]+)\/review$/);
  if (m && method === 'POST') return reviewVocabularyItem(m[1], body);
  m = p.match(/^\/api\/english\/vocabulary\/([^/]+)$/);
  if (m && method === 'DELETE') return deleteVocabularyItem(m[1]);
  if (method === 'POST' && p === '/api/english/recordings') return createSpeakingRecording(body as any);
  m = p.match(/^\/api\/english\/recordings\/([^/]+)$/);
  if (m && method === 'PUT') return updateSpeakingRecording(m[1], body);
  if (m && method === 'DELETE') return deleteSpeakingRecording(m[1]);
  if (method === 'POST' && p === '/api/english/cefr') return createCefrAssessment(body);
  if (method === 'POST' && p === '/api/english/resources') return createEnglishResource(body);
  m = p.match(/^\/api\/english\/resources\/([^/]+)$/);
  if (m && method === 'DELETE') return deleteEnglishResource(m[1]);
  if (method === 'POST' && p === '/api/english/writings') return createWritingEntry(body);
  m = p.match(/^\/api\/english\/writings\/([^/]+)$/);
  if (m && method === 'PUT') return updateWritingEntry(m[1], body);
  if (m && method === 'DELETE') return deleteWritingEntry(m[1]);

  // Offline Coach (replaces remote AI endpoints)
  if (method === 'GET' && p === '/api/ai/status') return getCoachStatus();
  if (method === 'GET' && p === '/api/ai/tutor/history') return getTutorHistory(query);
  if (method === 'DELETE' && p === '/api/ai/tutor/history') return clearTutorHistory(query);
  if (method === 'POST' && p === '/api/ai/tutor/chat') return postTutorChat(body);
  if (method === 'POST' && p === '/api/ai/speaking/analyze') return analyzeSpeakingRecording(body);

  // Goals & Fitness
  if (method === 'GET' && p === '/api/goals') return listGoals();
  if (method === 'POST' && p === '/api/goals') return createGoal(body);
  m = p.match(/^\/api\/goals\/([^/]+)\/approve-revision$/);
  if (m && method === 'POST') return approveGoalRevision(m[1], body);
  m = p.match(/^\/api\/goals\/([^/]+)\/milestones$/);
  if (m && method === 'POST') return createMilestone(m[1], body);
  m = p.match(/^\/api\/goals\/([^/]+)\/links$/);
  if (m && method === 'POST') return createGoalLink(m[1], body);
  m = p.match(/^\/api\/goals\/([^/]+)$/);
  if (m && method === 'PUT') return updateGoal(m[1], body);
  if (m && method === 'DELETE') return deleteGoal(m[1]);
  m = p.match(/^\/api\/milestones\/([^/]+)\/toggle$/);
  if (m && method === 'POST') return toggleMilestone(m[1]);
  m = p.match(/^\/api\/milestones\/([^/]+)$/);
  if (m && method === 'DELETE') return deleteMilestone(m[1]);
  m = p.match(/^\/api\/links\/([^/]+)$/);
  if (m && method === 'DELETE') return deleteGoalLink(m[1]);

  if (method === 'GET' && p === '/api/fitness') return getFitnessOverview();
  if (method === 'POST' && p === '/api/fitness/categories') return createWorkoutCategory(body);
  if (method === 'POST' && p === '/api/fitness/exercises') return createExercise(body);
  if (method === 'POST' && p === '/api/fitness/sessions') return createWorkoutSession(body);
  m = p.match(/^\/api\/fitness\/sessions\/([^/]+)$/);
  if (m && method === 'DELETE') return deleteWorkoutSession(m[1]);
  if (method === 'POST' && p === '/api/fitness/measurements') return createMeasurement(body as any);
  if (method === 'POST' && p === '/api/fitness/recovery') return saveRecoveryLog(body);

  // System, Timers, Notifications, Backups, JSON Export/Import
  if (method === 'GET' && p === '/api/system/settings') return getSettings();
  if (method === 'PUT' && p === '/api/system/settings') return updateSettings(body);
  if (method === 'POST' && p === '/api/system/sample-data/load') return loadSampleDataRoute();
  if (method === 'POST' && p === '/api/system/sample-data/clear') return clearSampleDataRoute();

  if (method === 'GET' && p === '/api/system/timers') return listTimers();
  if (method === 'POST' && p === '/api/system/timers/start') return startTimer(body);
  m = p.match(/^\/api\/system\/timers\/([^/]+)\/pause$/);
  if (m && method === 'POST') return pauseTimer(m[1]);
  m = p.match(/^\/api\/system\/timers\/([^/]+)\/resume$/);
  if (m && method === 'POST') return resumeTimer(m[1]);
  m = p.match(/^\/api\/system\/timers\/([^/]+)\/stop$/);
  if (m && method === 'POST') return stopTimer(m[1], body);
  m = p.match(/^\/api\/system\/timers\/([^/]+)$/);
  if (m && method === 'DELETE') return deleteTimer(m[1]);

  if (method === 'GET' && p === '/api/system/notifications') return listNotifications();
  m = p.match(/^\/api\/system\/notifications\/([^/]+)\/read$/);
  if (m && method === 'POST') return markNotificationRead(m[1]);

  if (method === 'GET' && p === '/api/system/backups') return listBackups();
  if (method === 'POST' && p === '/api/system/backups/create') return createBackupSnapshot(body);
  m = p.match(/^\/api\/system\/backups\/([^/]+)\/restore$/);
  if (m && method === 'POST') return restoreBackupSnapshot(m[1]);
  m = p.match(/^\/api\/system\/backups\/([^/]+)\/download$/);
  if (m && method === 'GET') return downloadBackupSnapshot(m[1]);

  if (method === 'GET' && p === '/api/system/export/json') return buildFullJsonExport();
  if (method === 'POST' && p === '/api/system/import/json') return importFullJsonBackup(body);

  throw new LocalHttpError(404, `Offline route not found: ${method} ${p}`);
}
