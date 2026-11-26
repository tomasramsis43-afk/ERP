'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Lang, dirOf, parseLang } from '@/lib/i18n';
import { Icon } from './Icon';

type Theme = 'light' | 'dark' | 'system';

interface AppCtx {
  lang: Lang;
  dir: 'rtl' | 'ltr';
  /** Picks the Arabic or English text, e.g. tr('العملاء', 'Customers'). */
  tr: (ar: string, en: string) => string;
  toggleLang: () => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  cycleTheme: () => void;
}

const AppContext = createContext<AppCtx | null>(null);

export const useApp = (): AppCtx => {
  const v = useContext(AppContext);
  if (!v) throw new Error('Providers missing');
  return v;
};

/** Shortcut for inline bilingual labels. */
export function useT(): (ar: string, en: string) => string {
  return useApp().tr;
}

/* ------------------------------------------------------------------ toast */

type ToastKind = 'ok' | 'error' | 'info';
interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}
interface ToastCtx {
  notify: (message: string, kind?: ToastKind) => void;
  success: (message: string) => void;
  failure: (message: string) => void;
}
const ToastContext = createContext<ToastCtx | null>(null);
export const useToast = (): ToastCtx => {
  const v = useContext(ToastContext);
  if (!v) throw new Error('Toast provider missing');
  return v;
};

/* ---------------------------------------------------------------- confirm */

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}
type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<ConfirmFn | null>(null);
export const useConfirm = (): ConfirmFn => {
  const v = useContext(ConfirmContext);
  if (!v) throw new Error('Confirm provider missing');
  return v;
};

/* ------------------------------------------------------------- preferences */

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* preference is simply not remembered */
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>('ar');
  const [theme, setTheme] = useState<Theme>('system');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [ask, setAsk] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const nextId = useRef(1);

  useEffect(() => {
    setLang(parseLang(read('erp.lang')));
    setTheme((read('erp.theme') as Theme) ?? 'system');
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dirOf(lang);
  }, [lang]);
  useEffect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleLang = useCallback(() => {
    setLang((l) => {
      const next = l === 'ar' ? 'en' : 'ar';
      write('erp.lang', next);
      return next;
    });
  }, []);
  const cycleTheme = useCallback(() => {
    setTheme((cur) => {
      const next: Theme = cur === 'system' ? 'light' : cur === 'light' ? 'dark' : 'system';
      write('erp.theme', next);
      return next;
    });
  }, []);
  const setThemePersist = useCallback((t: Theme) => {
    write('erp.theme', t);
    setTheme(t);
  }, []);

  const notify = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = nextId.current++;
    setToasts((list) => [...list, { id, message, kind }]);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 4200);
  }, []);

  const toastValue = useMemo<ToastCtx>(
    () => ({
      notify,
      success: (m) => notify(m, 'ok'),
      failure: (m) => notify(m, 'error'),
    }),
    [notify],
  );

  const confirm = useCallback<ConfirmFn>(
    (opts) => new Promise<boolean>((resolve) => setAsk({ ...opts, resolve })),
    [],
  );

  const appValue = useMemo<AppCtx>(
    () => ({
      lang,
      dir: dirOf(lang),
      tr: (ar, en) => (lang === 'ar' ? ar : en),
      toggleLang,
      theme,
      setTheme: setThemePersist,
      cycleTheme,
    }),
    [lang, toggleLang, theme, setThemePersist, cycleTheme],
  );

  function close(v: boolean) {
    ask?.resolve(v);
    setAsk(null);
  }

  return (
    <AppContext.Provider value={appValue}>
      <ToastContext.Provider value={toastValue}>
        <ConfirmContext.Provider value={confirm}>
          {children}
          <div className="toast-stack" aria-live="polite">
            {toasts.map((t) => (
              <div key={t.id} className={`toast ${t.kind}`}>
                <Icon name={t.kind === 'ok' ? 'check-circle' : t.kind === 'error' ? 'alert' : 'info'} size={16} />
                <span>{t.message}</span>
              </div>
            ))}
          </div>
          {ask ? (
            <div className="modal-backdrop" onClick={() => close(false)}>
              <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
                <div className="modal-head">
                  <div>
                    <div className="modal-title">{ask.title}</div>
                    {ask.message ? <div className="modal-sub">{ask.message}</div> : null}
                  </div>
                </div>
                <div className="modal-foot">
                  <button className="btn ghost" onClick={() => close(false)}>
                    {ask.cancelLabel ?? 'إلغاء'}
                  </button>
                  <button className={`btn ${ask.danger ? 'danger' : ''}`} onClick={() => close(true)} autoFocus>
                    {ask.confirmLabel ?? 'تأكيد'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </ConfirmContext.Provider>
      </ToastContext.Provider>
    </AppContext.Provider>
  );
}
