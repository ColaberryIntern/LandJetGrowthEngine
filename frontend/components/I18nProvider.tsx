'use client';

import { useState, useCallback, type ReactNode } from 'react';
import { I18nContext, t as translate, type Language, SUPPORTED_LANGUAGES } from '@/lib/i18n';

export default function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('lang');
      if (stored && SUPPORTED_LANGUAGES.includes(stored as Language)) {
        return stored as Language;
      }
    }
    return 'en';
  });

  const setLang = useCallback((newLang: Language) => {
    setLangState(newLang);
    if (typeof window !== 'undefined') {
      localStorage.setItem('lang', newLang);
    }
  }, []);

  const tFn = useCallback((key: string) => translate(key, lang), [lang]);

  return (
    <I18nContext.Provider value={{ lang, setLang, t: tFn }}>
      {children}
    </I18nContext.Provider>
  );
}
