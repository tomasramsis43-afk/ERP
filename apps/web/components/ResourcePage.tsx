'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { post, patch } from '@/lib/api';
import { useDebounced, usePaged, Paged } from '@/lib/hooks';
import { queryString } from '@/lib/format';
import { useApp, useToast } from './Providers';
import { Button, Column, DataTable, ErrorNote, Field, Input, Modal, Pagination, Select, Textarea, Check, PageHeader, Card } from './ui';

export interface FieldDef {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'money' | 'date' | 'select' | 'checkbox' | 'textarea' | 'password' | 'email' | 'tel';
  required?: boolean;
  col?: string;
  options?: { value: string; label: string }[];
  placeholder?: string;
  hint?: string;
  defaultValue?: string | boolean;
  disabled?: boolean;
  min?: string;
  step?: string;
  hideInCreate?: boolean;
  hideInEdit?: boolean;
  /** Optional value normaliser before the payload is sent. */
  transform?: (v: unknown) => unknown;
}

export interface ResourcePageProps<T> {
  title: string;
  sub?: string;
  endpoint: string;
  columns: Column<T>[];
  fields: FieldDef[];
  createLabel?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  filters?: { key: string; label: string; options: { value: string; label: string }[] }[];
  extraQuery?: Record<string, string | undefined>;
  rowActions?: (row: T) => React.ReactNode;
  onRowClick?: (row: T) => void;
  canCreate?: boolean;
  canEdit?: boolean;
  editLabel?: string;
  toEditValues?: (row: T) => Record<string, unknown>;
  pageSize?: number;
  toolbarExtra?: React.ReactNode;
  createDefaults?: Record<string, unknown>;
  /** Opens the create form when the page loads (used by the global "new" menu). */
  autoCreate?: boolean;
  emptyTitle?: string;
  emptySub?: string;
  onChanged?: () => void;
  /** Optional detail renderer; when set, clicking a row opens it in a modal. */
  renderDetail?: (row: T, close: () => void, reload: () => void) => React.ReactNode;
  detailTitle?: (row: T) => React.ReactNode;
}

export function ResourcePage<T extends { id: string }>({
  title,
  sub,
  endpoint,
  columns,
  fields,
  createLabel,
  searchable = true,
  searchPlaceholder,
  filters,
  extraQuery,
  rowActions,
  onRowClick,
  canCreate = true,
  canEdit = true,
  editLabel,
  toEditValues,
  pageSize: initialPageSize = 25,
  toolbarExtra,
  createDefaults,
  autoCreate,
  emptyTitle,
  emptySub,
  onChanged,
  renderDetail,
  detailTitle,
}: ResourcePageProps<T>) {
  const { tr } = useApp();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState('');
  const debounced = useDebounced(draft, 350);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<T | null>(null);
  const [creating, setCreating] = useState(Boolean(autoCreate));
  const [detail, setDetail] = useState<T | null>(null);

  useEffect(() => {
    setQ(debounced.trim());
    setPage(1);
  }, [debounced]);

  const path = useMemo(
    () => `${endpoint}${queryString({ page, pageSize, ...(searchable ? { q } : {}), ...filterValues, ...extraQuery })}`,
    [endpoint, page, pageSize, q, filterValues, extraQuery, searchable],
  );
  const { data, error, loading, reload } = usePaged<T>(path);

  function refresh() {
    reload();
    onChanged?.();
  }

  const allColumns = useMemo(() => {
    if (!rowActions) return columns;
    return [
      ...columns,
      {
        key: '__actions',
        header: '',
        align: 'end' as const,
        width: '1%',
        render: (row: T) => (
          <div className="row-actions" onClick={(e) => e.stopPropagation()}>
            {rowActions(row)}
          </div>
        ),
      },
    ];
  }, [columns, rowActions]);

  return (
    <>
      <PageHeader title={title} sub={sub}>
        {toolbarExtra}
        {canCreate ? (
          <Button icon="plus" onClick={() => setCreating(true)}>
            {createLabel ?? tr('إضافة جديد', 'New')}
          </Button>
        ) : null}
      </PageHeader>

      <Card>
        <div style={{ padding: '14px 16px 0' }}>
          <div className="toolbar">
            {searchable ? (
              <div className="search-global search" style={{ width: 'auto', flex: '0 1 280px' }}>
                <IconSearch />
                <input
                  value={draft}
                  placeholder={searchPlaceholder ?? tr('بحث…', 'Search…')}
                  onChange={(e) => setDraft(e.target.value)}
                />
              </div>
            ) : null}
            {filters?.map((f) => (
              <Select
                key={f.key}
                value={filterValues[f.key] ?? ''}
                onChange={(e) => {
                  setFilterValues((v) => ({ ...v, [f.key]: e.target.value }));
                  setPage(1);
                }}
                style={{ width: 'auto', minWidth: 150 }}
              >
                <option value="">{f.label}</option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            ))}
          </div>
        </div>

        <ErrorNote error={error} />
        <DataTable
          columns={allColumns}
          rows={data?.items ?? []}
          rowKey={(r) => r.id}
          loading={loading && !data}
          onRowClick={renderDetail ? (r) => setDetail(r) : onRowClick}
          empty={
            <div className="empty">
              <div className="empty-title">{emptyTitle ?? tr('لا توجد بيانات بعد', 'No records yet')}</div>
              <div className="empty-sub">{emptySub ?? tr('ابدأ بإضافة أول سجل', 'Create your first record')}</div>
            </div>
          }
        />
        {data ? (
          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            onPage={setPage}
            onPageSize={(n) => {
              setPageSize(n);
              setPage(1);
            }}
          />
        ) : null}
      </Card>

      <ResourceForm
        open={creating || Boolean(editing)}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        endpoint={endpoint}
        fields={fields}
        title={editing ? (editLabel ?? tr(`تعديل ${title}`, `Edit ${title}`)) : (createLabel ?? tr(`إضافة ${title}`, `New ${title}`))}
        initial={editing ? (toEditValues ? toEditValues(editing) : (editing as unknown as Record<string, unknown>)) : { ...createDefaults }}
        mode={editing ? 'edit' : 'create'}
        id={editing?.id}
        onSaved={() => {
          setCreating(false);
          setEditing(null);
          refresh();
          toast.success(tr('تم الحفظ بنجاح', 'Saved successfully'));
        }}
      />

      {renderDetail && detail ? (
        <Modal
          open
          onClose={() => setDetail(null)}
          title={detailTitle ? detailTitle(detail) : title}
          size="xl"
        >
          {renderDetail(detail, () => setDetail(null), refresh)}
        </Modal>
      ) : null}
    </>
  );
}

function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function ResourceForm({
  open,
  onClose,
  endpoint,
  fields,
  title,
  initial,
  mode,
  id,
  onSaved,
  extraBody,
  submitLabel,
}: {
  open: boolean;
  onClose: () => void;
  endpoint: string;
  fields: FieldDef[];
  title: string;
  initial: Record<string, unknown>;
  mode: 'create' | 'edit';
  id?: string;
  onSaved: () => void;
  extraBody?: React.ReactNode;
  submitLabel?: string;
}) {
  const { tr } = useApp();
  const toast = useToast();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const initialRef = useRef(initial);
  initialRef.current = initial;
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;

  // Reset only when the dialog opens, never on a parent re-render.
  useEffect(() => {
    if (!open) return;
    const next: Record<string, unknown> = {};
    for (const f of fieldsRef.current) {
      const raw = initialRef.current[f.name];
      let value: unknown = raw === null || raw === undefined ? (f.defaultValue ?? (f.type === 'checkbox' ? false : '')) : raw;
      if (f.type === 'date' && typeof value === 'string' && value.length > 10) value = value.slice(0, 10);
      next[f.name] = value;
    }
    setValues(next);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const visible = fields.filter((f) => (mode === 'create' ? !f.hideInCreate : !f.hideInEdit));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {};
      for (const f of visible) {
        let v = values[f.name];
        if (f.transform) v = f.transform(v);
        if (v === '' || v === undefined || v === null) continue;
        payload[f.name] = v;
      }
      if (mode === 'create') await post(endpoint, payload);
      else await patch(`${endpoint}/${id}`, payload);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} type="button">
            {tr('إلغاء', 'Cancel')}
          </Button>
          <Button type="submit" form="resource-form" loading={busy} icon="save">
            {submitLabel ?? tr('حفظ', 'Save')}
          </Button>
        </>
      }
    >
      <form id="resource-form" onSubmit={submit}>
        <div className="form-grid">
          {visible.map((f) => (
            <Field key={f.name} label={f.label} required={f.required} hint={f.hint} className={f.col ?? 'col-4'}>
              {f.type === 'select' ? (
                <Select
                  value={String(values[f.name] ?? '')}
                  required={f.required}
                  disabled={f.disabled}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                >
                  <option value="">—</option>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              ) : f.type === 'textarea' ? (
                <Textarea
                  value={String(values[f.name] ?? '')}
                  required={f.required}
                  disabled={f.disabled}
                  placeholder={f.placeholder}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                />
              ) : f.type === 'checkbox' ? (
                <div style={{ height: 38, display: 'flex', alignItems: 'center' }}>
                  <Check
                    checked={Boolean(values[f.name])}
                    disabled={f.disabled}
                    label={f.placeholder ?? tr('نعم', 'Yes')}
                    onChange={(checked) => setValues((v) => ({ ...v, [f.name]: checked }))}
                  />
                </div>
              ) : (
                <Input
                  type={f.type === 'money' || f.type === 'number' ? 'number' : f.type ?? 'text'}
                  step={f.step ?? (f.type === 'money' ? '0.01' : undefined)}
                  min={f.min ?? (f.type === 'money' || f.type === 'number' ? '0' : undefined)}
                  dir={f.type === 'money' || f.type === 'number' || f.type === 'date' ? 'ltr' : undefined}
                  value={String(values[f.name] ?? '')}
                  required={f.required}
                  disabled={f.disabled}
                  placeholder={f.placeholder}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                />
              )}
            </Field>
          ))}
          {extraBody}
        </div>
        {error ? <div className="mt-16"><ErrorNote error={error} /></div> : null}
      </form>
    </Modal>
  );
}
