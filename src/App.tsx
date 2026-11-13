import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Bell,
  BookOpen,
  CheckSquare,
  Compass,
  Dumbbell,
  GraduationCap,
  Home,
  Languages,
  Menu,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
  Target,
  X,
} from 'lucide-react';
import { api } from './lib/api.ts';
import { Button } from './components/ui/Primitives.tsx';
import { OnboardingModal } from './components/OnboardingModal.tsx';
import {
  GlobalSearchModal,
  NotificationsModal,
  PersistentTimerBanner,
  QuickAddModal,
} from './components/GlobalOverlays.tsx';
import { HomeView } from './views/HomeView.tsx';
import { BooksView } from './views/BooksView.tsx';
import { TasksHabitsView } from './views/TasksHabitsView.tsx';
import { StudyView } from './views/StudyView.tsx';
import { EnglishView } from './views/EnglishView.tsx';
import { GoalsView } from './views/GoalsView.tsx';
import { FitnessView } from './views/FitnessView.tsx';
import { AnalyticsView } from './views/AnalyticsView.tsx';
import { SettingsView } from './views/SettingsView.tsx';
import type { ActiveTimer, NotificationItem, ThemeMode, UserSettings } from './shared/types.ts';

type SectionId =
  | 'home'
  | 'books'
  | 'tasks'
  | 'study'
  | 'english'
  | 'goals'
  | 'fitness'
  | 'analytics'
  | 'settings';

const NAV_ITEMS: Array<{ id: SectionId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'books', label: 'Books & Reading', icon: BookOpen },
  { id: 'tasks', label: 'Tasks & Habits', icon: CheckSquare },
  { id: 'study', label: 'Study & Learning', icon: GraduationCap },
  { id: 'english', label: 'English Learning', icon: Languages },
  { id: 'goals', label: 'Goals & Life Planning', icon: Target },
  { id: 'fitness', label: 'Workout & Fitness', icon: Dumbbell },
  { id: 'analytics', label: 'Analytics & Reports', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function App() {
  const [section, setSection] = useState<SectionId>('home');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [timers, setTimers] = useState<ActiveTimer[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  function applyTheme(mode: ThemeMode) {
    setTheme(mode);
    const isDark =
      mode === 'dark' ||
      (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
  }

  async function loadShellState() {
    try {
      const [sRes, tRes, nRes] = await Promise.all([
        api.get<{ settings: UserSettings }>('/api/system/settings'),
        api.get<{ timers: ActiveTimer[] }>('/api/system/timers'),
        api.get<{ notifications: NotificationItem[] }>('/api/system/notifications'),
      ]);
      setSettings(sRes.settings);
      applyTheme(sRes.settings.theme);
      setTimers(tRes.timers);
      setNotifications(nRes.notifications);
    } catch {
      // handled gracefully by child views
    }
  }

  useEffect(() => {
    loadShellState();
  }, [refreshKey]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  async function toggleQuickTheme() {
    const next: ThemeMode = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    await api.put('/api/system/settings', { theme: next });
  }

  const activeNav = NAV_ITEMS.find((n) => n.id === section)!;

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* First-Run Onboarding */}
      {settings && settings.onboarding_completed === 0 && (
        <OnboardingModal
          onComplete={(chosenTheme) => {
            applyTheme(chosenTheme);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}

      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Left Sidebar Navigation */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-64 shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col transition-transform duration-150 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="h-14 px-5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 font-display font-semibold text-sm tracking-tight text-slate-900 dark:text-slate-50 whitespace-nowrap">
            <Compass className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span>Brain Sculpting Camp</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 text-slate-500 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setSection(item.id);
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
          On-device SQLite + Capacitor storage
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract: Breadcrumb + Search + Notifications + Theme + Quick Add */}
        <header className="h-14 px-4 sm:px-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
              className="lg:hidden p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="text-sm text-slate-500 dark:text-slate-400 truncate">
              <span>Camp</span>
              <span className="mx-2">/</span>
              <span className="font-medium text-slate-900 dark:text-slate-100">{activeNav.label}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" onClick={() => setSearchOpen(true)}>
              <Search className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Search</span>
              <kbd className="hidden md:inline text-[10px] font-mono text-slate-400 ml-1">Ctrl+K</kbd>
            </Button>

            <button
              onClick={() => setNotifOpen(true)}
              aria-label="Notifications"
              className="relative p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Bell className="w-4 h-4 text-slate-600 dark:text-slate-300" />
              {notifications.length > 0 && (
                <span className="absolute -top-1 -right-1 px-1 min-w-[16px] h-4 rounded-full bg-amber-600 text-white text-[10px] font-mono flex items-center justify-center">
                  {notifications.length}
                </span>
              )}
            </button>

            <button
              onClick={toggleQuickTheme}
              aria-label="Toggle theme"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-slate-300" />
              ) : (
                <Moon className="w-4 h-4 text-slate-600" />
              )}
            </button>

            <Button size="sm" variant="primary" onClick={() => setQuickAddOpen(true)}>
              <Plus className="w-3.5 h-3.5" />
              Quick Add
            </Button>
          </div>
        </header>

        {/* Persistent Active Timer Banner */}
        <PersistentTimerBanner
          timers={timers}
          onChanged={() => setRefreshKey((k) => k + 1)}
        />

        {/* Scrollable Workspace Viewport */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="max-w-7xl mx-auto">
            {section === 'home' && (
              <HomeView
                onNavigate={(s) => setSection(s as SectionId)}
                onTimersChanged={() => setRefreshKey((k) => k + 1)}
                refreshKey={refreshKey}
              />
            )}
            {section === 'books' && (
              <BooksView onTimersChanged={() => setRefreshKey((k) => k + 1)} />
            )}
            {section === 'tasks' && (
              <TasksHabitsView onTimersChanged={() => setRefreshKey((k) => k + 1)} />
            )}
            {section === 'study' && (
              <StudyView onTimersChanged={() => setRefreshKey((k) => k + 1)} />
            )}
            {section === 'english' && (
              <EnglishView onNavigate={(s) => setSection(s as SectionId)} />
            )}
            {section === 'goals' && <GoalsView />}
            {section === 'fitness' && <FitnessView />}
            {section === 'analytics' && <AnalyticsView />}
            {section === 'settings' && (
              <SettingsView
                onThemeChange={applyTheme}
                onSettingsUpdated={() => setRefreshKey((k) => k + 1)}
              />
            )}
          </div>
        </main>
      </div>

      {/* Modals */}
      <GlobalSearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onNavigate={(s) => setSection(s as SectionId)}
      />
      <QuickAddModal
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        onCreated={() => setRefreshKey((k) => k + 1)}
      />
      <NotificationsModal
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        notifications={notifications}
        onNavigate={(s) => setSection(s as SectionId)}
      />
    </div>
  );
}
