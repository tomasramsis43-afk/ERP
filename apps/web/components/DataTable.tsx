'use client';

import React from 'react';
import { useApp } from './Providers';

export interface Column<R> {
  header: string;
  render: (row: R) => React.ReactNode;
  numeric?: boolean;
}

export function DataTable<R>({ columns, rows, rowKey, boldRow }: { columns: Column<R>[]; rows: R[]; rowKey: (r: R, i: number) => string; boldRow?: (r: R) => boolean }) {
  const { t } = useApp();
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map((c) => <th key={c.header} className={c.numeric ? 'num' : undefined}>{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="muted">{t('empty')}</td></tr>
          ) : (
            rows.map((r, i) => (
              <tr key={rowKey(r, i)} className={boldRow?.(r) ? 'bold' : undefined}>
                {columns.map((c) => <td key={c.header} className={c.numeric ? 'num' : undefined}>{c.render(r)}</td>)}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
