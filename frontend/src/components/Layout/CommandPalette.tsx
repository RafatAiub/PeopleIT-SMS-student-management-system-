import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, CornerDownLeft, ArrowRight, Sun, Moon, Monitor, Languages, LogOut, Keyboard } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { useAuth } from '@/hooks/useAuth';
import { useLocaleStore, useT } from '@/i18n';
import { getNavTargets } from './Sidebar';
import { useDialogBehaviour } from '@/components/ui/Modal';
import { Modal } from '@/components/ui/Modal';
import { Kbd } from '@/components/ui/Display';
import { cn } from '@/lib/cn';

/**
 * Global command palette (Ctrl/⌘ + K, or "/" when not typing).
 * Only offers pages the current role can already reach from the sidebar,
 * so it can never become a way around role-based access.
 */

interface Command {
  id: string;
  label: string;
  group: string;
  icon?: React.ReactNode;
  keywords?: string;
  run: () => void;
}

const isTypingTarget = (el: EventTarget | null) => {
  const n = el as HTMLElement | null;
  if (!n) return false;
  return n.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(n.tagName);
};

// Tiny event bus so the header button and keyboard shortcut share one palette.
const OPEN_EVENT = 'sms:open-command-palette';
export const openCommandPalette = () => window.dispatchEvent(new Event(OPEN_EVENT));

function score(label: string, q: string) {
  const l = label.toLowerCase();
  if (l.startsWith(q)) return 3;
  if (l.split(/\s+/).some((w) => w.startsWith(q))) return 2;
  if (l.includes(q)) return 1;
  // subsequence match ("stad" → "Students Admission")
  let i = 0;
  for (const ch of l) if (ch === q[i]) i++;
  return i === q.length ? 0.5 : 0;
}

export const CommandPalette: React.FC = () => {
  const [open, setOpen] = React.useState(false);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [active, setActive] = React.useState(0);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const t = useT();
  const { user } = useAuthStore();
  const { setTheme } = useUiStore();
  const { lang, setLang } = useLocaleStore();
  const { logout } = useAuth();

  const close = React.useCallback(() => {
    setOpen(false);
    setQuery('');
    setActive(0);
  }, []);
  useDialogBehaviour(open, close, panelRef);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === '/' && !open && !isTypingTarget(e.target)) {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === '?' && e.shiftKey && !open && !isTypingTarget(e.target)) {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, [open]);

  const commands = React.useMemo<Command[]>(() => {
    const pages: Command[] = getNavTargets(user?.role).map((n) => ({
      id: `nav:${n.to}`,
      label: t(n.label),
      group: t('Pages'),
      keywords: `${n.label} ${t(n.group)} ${n.group}`,
      icon: <ArrowRight className="w-4 h-4" />,
      run: () => navigate(n.to),
    }));
    const actions: Command[] = [
      { id: 'theme:light', label: `${t('Theme')}: ${t('Light')}`, group: t('Actions'), icon: <Sun className="w-4 h-4" />, run: () => setTheme('light') },
      { id: 'theme:dark', label: `${t('Theme')}: ${t('Dark')}`, group: t('Actions'), icon: <Moon className="w-4 h-4" />, run: () => setTheme('dark') },
      { id: 'theme:system', label: `${t('Theme')}: ${t('System')}`, group: t('Actions'), icon: <Monitor className="w-4 h-4" />, run: () => setTheme('system') },
      {
        id: 'lang',
        label: `${t('Language')}: ${lang === 'en' ? 'বাংলা' : 'English'}`,
        group: t('Actions'),
        keywords: 'language bangla bengali english ভাষা',
        icon: <Languages className="w-4 h-4" />,
        run: () => setLang(lang === 'en' ? 'bn' : 'en'),
      },
      { id: 'shortcuts', label: t('Keyboard shortcuts'), group: t('Actions'), icon: <Keyboard className="w-4 h-4" />, run: () => setShortcutsOpen(true) },
      {
        id: 'signout',
        label: t('Sign out'),
        group: t('Actions'),
        icon: <LogOut className="w-4 h-4" />,
        run: () => logout.mutate(undefined, { onSettled: () => navigate('/login') }),
      },
    ];
    return [...pages, ...actions];
  }, [user?.role, t, navigate, setTheme, lang, setLang, logout]);

  const q = query.trim().toLowerCase();
  const results = React.useMemo(() => {
    if (!q) return commands;
    return commands
      .map((c) => { const k = score(c.keywords ?? '', q); return { c, s: Math.max(score(c.label, q), k >= 1 ? k * 0.8 : 0) }; })
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.c);
  }, [commands, q]);

  React.useEffect(() => setActive(0), [q]);
  React.useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const runAt = (i: number) => {
    const cmd = results[i];
    if (!cmd) return;
    close();
    cmd.run();
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runAt(active);
    }
  };

  let lastGroup = '';

  return (
    <>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[60] flex items-start justify-center px-3 pt-[12vh]">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]"
              onClick={close}
              aria-hidden
            />
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label="Command palette"
              initial={{ opacity: 0, scale: 0.98, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -8 }}
              transition={{ duration: 0.14 }}
              className="relative w-full max-w-xl rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-lg overflow-hidden"
            >
              <div className="flex items-center gap-3 px-4 border-b border-slate-100 dark:border-white/8">
                <Search className="w-4 h-4 text-slate-400 shrink-0" aria-hidden />
                <input
                  data-autofocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onInputKey}
                  placeholder={t('Search pages and actions…')}
                  role="combobox"
                  aria-expanded="true"
                  aria-controls="cmdk-list"
                  aria-activedescendant={results[active] ? `cmdk-${results[active].id}` : undefined}
                  className="flex-1 h-12 bg-transparent text-[15px] text-slate-900 dark:text-slate-50 placeholder:text-slate-400 focus:outline-none"
                />
                <Kbd>Esc</Kbd>
              </div>
              <div ref={listRef} id="cmdk-list" role="listbox" className="max-h-[55vh] overflow-y-auto p-1.5">
                {results.length === 0 ? (
                  <p className="px-3 py-8 text-center text-sm text-slate-500 dark:text-slate-400">{t('No results')}</p>
                ) : (
                  results.map((cmd, i) => {
                    const header = cmd.group !== lastGroup ? cmd.group : null;
                    lastGroup = cmd.group;
                    return (
                      <React.Fragment key={cmd.id}>
                        {header && (
                          <div className="px-3 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{header}</div>
                        )}
                        <div
                          id={`cmdk-${cmd.id}`}
                          role="option"
                          aria-selected={i === active}
                          data-idx={i}
                          onMouseMove={() => setActive(i)}
                          onClick={() => runAt(i)}
                          className={cn(
                            'flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-sm',
                            i === active ? 'bg-primary-50 text-primary-900 dark:bg-primary-500/15 dark:text-primary-100' : 'text-slate-700 dark:text-slate-200'
                          )}
                        >
                          <span className={cn('shrink-0', i === active ? 'text-primary-600 dark:text-primary-300' : 'text-slate-400')}>{cmd.icon}</span>
                          <span className="flex-1 truncate">{cmd.label}</span>
                          {i === active && <CornerDownLeft className="w-3.5 h-3.5 opacity-60" aria-hidden />}
                        </div>
                      </React.Fragment>
                    );
                  })
                )}
              </div>
              <div className="hidden sm:flex items-center gap-4 px-4 py-2 border-t border-slate-100 dark:border-white/8 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
                <span className="flex items-center gap-1"><Kbd>↵</Kbd> open</span>
                <span className="flex items-center gap-1"><Kbd>Ctrl</Kbd><Kbd>K</Kbd> toggle</span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <Modal isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} title={t('Keyboard shortcuts')} size="sm">
        <ul className="space-y-2.5 text-sm">
          {[
            [['Ctrl', 'K'], 'Open command palette'],
            [['/'], 'Open command palette'],
            [['?'], 'Show keyboard shortcuts'],
            [['Esc'], 'Close dialog / menu'],
            [['↑', '↓'], 'Move through lists and menus'],
            [['Tab'], 'Next field; attendance & marks grids use arrow keys'],
          ].map(([keys, desc], i) => (
            <li key={i} className="flex items-center justify-between gap-4">
              <span className="text-slate-700 dark:text-slate-300">{desc as string}</span>
              <span className="flex gap-1 shrink-0">{(keys as string[]).map((k) => <Kbd key={k}>{k}</Kbd>)}</span>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
};
