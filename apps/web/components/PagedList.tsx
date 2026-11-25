'use client';

import React, { useState } from 'react';
import { queryString } from '@/lib/format';
import { useApi } from '@/lib/useApi';
import { Column, DataTable } from './DataTable';
import { useApp } from './Providers';

interface Page<R> {
  items: R[];
  total: number;
  page: number;
  pageSize: number;
}

/** A searchable, paged list backed by any of the API's `{items,total,page,pageSize}` endpoints. */
export function PagedList<R>({ title, path, columns, rowKey, searchable = true, extra }: { title: string; path: string; columns: Column<R>[]; rowKey: (r: R) => string; searchable?: boolean; extra?: Record<string, string> }) {
  const { t } = useApp();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState('');
  const { data, error, loading } = useApi<Page<R>>(`${path}${queryString({ page, pageSize: 25, q, ...extra })}`);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <h1>{title}</h1>
      {searchable ? (
        <form className="toolbar" onSubmit={(e) => { e.preventDefault(); setPage(1); setQ(draft.trim()); }}>
          <input value={draft} placeholder={t('search')} onChange={(e) => setDraft(e.target.value)} />
          <button className="btn" type="submit">{t('search')}</button>
        </form>
      ) : null}
      {error ? <p className="error">{t('error')}: {error}</p> : null}
      {loading && !data ? <p className="muted">{t('loading')}</p> : null}
      {data ? <DataTable columns={columns} rows={data.items} rowKey={(r) => rowKey(r)} /> : null}
      <div className="pager">
        <button className="btn ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('previous')}</button>
        <span className="muted">{page} / {pages}</span>
        <button className="btn ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t('next')}</button>
      </div>
    </>
  );
}
