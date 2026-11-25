'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Key, Lang, dirOf, parseLang, translate } from '@/lib/i18n';

type Theme = 'light' | 'dark' | 'system';
interface Ctx {
  lang: Lang;
  t: (k: Key) => string;
  toggleLang: () => void;
  theme: Theme;
  cycleTheme: () => void;
}

const C = createContext<Ctx | null>(null);
export const useApp = (): Ctx => {
  const v = useContext(C);
  if (!v) throw new Error('Providers missing');
  return v;
};

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // private windows and blocked storage must not break the app
  }
}
function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* preference simply is not remembered */
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>('ar');
  const [theme, setTheme] = useState<Theme>('system');

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

  const value = useMemo<Ctx>(() => ({ lang, t: (k) => translate(lang, k), toggleLang, theme, cycleTheme }), [lang, toggleLang, theme, cycleTheme]);
  return <C.Provider value={value}>{children}</C.Provider>;
}
