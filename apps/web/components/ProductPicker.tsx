'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useApp } from './Providers';
import { Input, Money } from './ui';
import { useApi, useDebounced } from '@/lib/hooks';

export interface ProductLite {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  baseUnitId: string;
  baseUnit?: { id: string; nameAr: string; nameEn: string };
  units?: { unitId: string; factor: string; unit?: { id: string; nameAr: string; nameEn: string } }[];
  retailPrice: string;
  wholesalePrice: string;
  purchasePrice: string;
}

/** Searchable product select used by every document line. */
export function ProductPicker({ value, onPick }: { value: ProductLite | null; onPick: (p: ProductLite | null) => void }) {
  const { tr, lang } = useApp();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const debounced = useDebounced(q, 250);
  const results = useApi<{ items: ProductLite[] }>(open && debounced ? `products?q=${encodeURIComponent(debounced)}&pageSize=8&active=true` : null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      {value ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--line)', borderRadius: 8, padding: '0 8px', height: 38, background: 'var(--surface)' }}>
          <span className="tree-code">{value.code}</span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {lang === 'ar' ? value.nameAr : value.nameEn}
          </span>
          <button type="button" className="mini-btn" onClick={() => { onPick(null); setQ(''); }} title={tr('تغيير', 'Change')}>
            ×
          </button>
        </div>
      ) : (
        <Input
          value={q}
          placeholder={tr('ابحث عن صنف…', 'Search product…')}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        />
      )}
      {open && !value ? (
        <div className="card" style={{ position: 'absolute', insetInlineStart: 0, top: 42, width: '100%', minWidth: 260, zIndex: 60, padding: 4, maxHeight: 260, overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
          {!debounced ? (
            <div className="hint" style={{ padding: 10 }}>{tr('اكتب حرفين على الأقل…', 'Type at least two characters…')}</div>
          ) : results.loading ? (
            <div className="hint" style={{ padding: 10 }}>{tr('جارٍ البحث…', 'Searching…')}</div>
          ) : (results.data?.items ?? []).length === 0 ? (
            <div className="hint" style={{ padding: 10 }}>{tr('لا نتائج', 'No results')}</div>
          ) : (
            (results.data?.items ?? []).map((p) => (
              <button
                type="button"
                key={p.id}
                className="nav-item"
                style={{ color: 'var(--text)', width: '100%', background: 'none', border: 0, cursor: 'pointer' }}
                onClick={() => { onPick(p); setOpen(false); setQ(''); }}
              >
                <span className="tree-code">{p.code}</span>
                <span style={{ flex: 1, textAlign: 'start' }}>{lang === 'ar' ? p.nameAr : p.nameEn}</span>
                <Money value={p.retailPrice} />
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
