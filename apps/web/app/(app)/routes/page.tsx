'use client';

import React, { useEffect, useState } from 'react';
import { useApp, useToast } from '@/components/Providers';
import { Button, Card, DataTable, EmptyState, ErrorNote, Field, Input, Loading, Modal, PageHeader, Select, Tabs } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import { post } from '@/lib/api';

interface Area { id: string; level: 'CITY' | 'REGION' | 'DISTRICT'; nameAr: string; nameEn: string; parentId: string | null }
interface Route { id: string; code: string; nameAr: string; nameEn: string; geoAreaId: string | null; geoArea?: { nameAr: string } | null }
interface Customer { id: string; code: string; nameAr: string }

export default function RoutesPage() {
  const { tr, lang } = useApp();
  const [tab, setTab] = useState<'areas' | 'routes'>('areas');
  const [creatingArea, setCreatingArea] = useState(false);
  const [creatingRoute, setCreatingRoute] = useState(false);
  const [areaForm, setAreaForm] = useState({ level: 'CITY', nameAr: '', nameEn: '', parentId: '' });
  const [routeForm, setRouteForm] = useState({ code: '', nameAr: '', nameEn: '', geoAreaId: '' });
  const [assignRoute, setAssignRoute] = useState<Route | null>(null);
  const [selectedCusts, setSelectedCusts] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [ferr, setFerr] = useState<string | null>(null);
  const areas = useApi<Area[]>('geo-areas');
  const routes = useApi<Route[]>('routes');
  const customers = useApi<{ items: Customer[] }>('customers?pageSize=200');

  useEffect(() => {
    if (creatingArea) setAreaForm({ level: 'CITY', nameAr: '', nameEn: '', parentId: '' });
  }, [creatingArea]);
  useEffect(() => {
    if (creatingRoute) setRouteForm({ code: '', nameAr: '', nameEn: '', geoAreaId: '' });
  }, [creatingRoute]);
  useEffect(() => {
    if (assignRoute) setSelectedCusts(new Set());
  }, [assignRoute]);

  const toast = useToast();

  async function createArea(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setFerr(null);
    try {
      const payload: Record<string, unknown> = { level: areaForm.level, nameAr: areaForm.nameAr, nameEn: areaForm.nameEn };
      if (areaForm.parentId) payload.parentId = areaForm.parentId;
      await post('geo-areas', payload);
      toast.success(tr('تم حفظ المنطقة', 'Area saved'));
      setCreatingArea(false);
      areas.reload();
    } catch (err) { setFerr((err as Error).message); }
    finally { setBusy(false); }
  }

  async function createRoute(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setFerr(null);
    try {
      const payload: Record<string, unknown> = { code: routeForm.code, nameAr: routeForm.nameAr, nameEn: routeForm.nameEn };
      if (routeForm.geoAreaId) payload.geoAreaId = routeForm.geoAreaId;
      await post('routes', payload);
      toast.success(tr('تم حفظ الخط', 'Route saved'));
      setCreatingRoute(false);
      routes.reload();
    } catch (err) { setFerr((err as Error).message); }
    finally { setBusy(false); }
  }

  async function assign() {
    if (!assignRoute) return;
    setBusy(true); setFerr(null);
    try {
      await post(`routes/${assignRoute.id}/customers`, { customerIds: [...selectedCusts] });
      toast.success(tr('تم تعيين العملاء', 'Customers assigned'));
      setAssignRoute(null);
    } catch (err) { setFerr((err as Error).message); }
    finally { setBusy(false); }
  }

  const parentOptions = (level: string) => {
    const parentLevel = level === 'REGION' ? 'CITY' : level === 'DISTRICT' ? 'REGION' : null;
    if (!parentLevel) return [];
    return (areas.data ?? []).filter((a) => a.level === parentLevel);
  };

  return (
    <>
      <PageHeader title={tr('المناطق وخطوط السير', 'Areas & routes')} sub={tr('المدن والمناطق والأحياء وخطوط التوزيع', 'Cities, regions, districts and distribution routes')} />
      <div style={{ marginBottom: 16 }}>
        <Tabs value={tab} onChange={setTab} tabs={[
          { id: 'areas', label: tr('المناطق', 'Areas') },
          { id: 'routes', label: tr('خطوط السير', 'Routes') },
        ]} />
      </div>

      {tab === 'areas' ? (
        <>
          <div className="page-actions" style={{ marginBottom: 12, justifyContent: 'flex-end' }}>
            <Button icon="plus" onClick={() => setCreatingArea(true)}>{tr('منطقة جديدة', 'New area')}</Button>
          </div>
          <Card>
            <ErrorNote error={areas.error} />
            {areas.loading && !areas.data ? <Loading /> : null}
            {areas.data ? (
              <DataTable<Area>
                rows={areas.data}
                rowKey={(r) => r.id}
                columns={[
                  { key: 'level', header: tr('المستوى', 'Level'), render: (r) => r.level },
                  { key: 'name', header: tr('الاسم', 'Name'), render: (r) => (lang === 'ar' ? r.nameAr : r.nameEn) },
                  { key: 'parent', header: tr('الأب', 'Parent'), render: (r) => (areas.data ?? []).find((a) => a.id === r.parentId)?.nameAr ?? '—' },
                ]}
                empty={<EmptyState title={tr('لا توجد مناطق', 'No areas')} />}
              />
            ) : null}
          </Card>
        </>
      ) : (
        <>
          <div className="page-actions" style={{ marginBottom: 12, justifyContent: 'flex-end' }}>
            <Button icon="plus" onClick={() => setCreatingRoute(true)}>{tr('خط جديد', 'New route')}</Button>
          </div>
          <Card>
            <ErrorNote error={routes.error} />
            {routes.loading && !routes.data ? <Loading /> : null}
            {routes.data ? (
              <DataTable<Route>
                rows={routes.data}
                rowKey={(r) => r.id}
                columns={[
                  { key: 'code', header: tr('الكود', 'Code'), width: '110px', render: (r) => <span className="tree-code">{r.code}</span> },
                  { key: 'name', header: tr('الاسم', 'Name'), render: (r) => (lang === 'ar' ? r.nameAr : r.nameEn) },
                  { key: 'area', header: tr('المنطقة', 'Area'), render: (r) => r.geoArea?.nameAr ?? '—' },
                  {
                    key: 'actions',
                    header: '',
                    align: 'end',
                    width: '1%',
                    render: (r) => <Button size="sm" variant="ghost" onClick={() => setAssignRoute(r)}>{tr('تعيين عملاء', 'Assign customers')}</Button>,
                  },
                ]}
                empty={<EmptyState title={tr('لا توجد خطوط', 'No routes')} />}
              />
            ) : null}
          </Card>
        </>
      )}

      <Modal open={creatingArea} onClose={() => setCreatingArea(false)} title={tr('منطقة جديدة', 'New area')} footer={
        <>
          <Button variant="ghost" onClick={() => setCreatingArea(false)}>{tr('إلغاء', 'Cancel')}</Button>
          <Button type="submit" form="area-form" loading={busy} icon="save">{tr('حفظ', 'Save')}</Button>
        </>
      }>
        <form id="area-form" onSubmit={createArea}>
          <div className="form-grid">
            <Field label={tr('المستوى', 'Level')} required className="col-4">
              <Select value={areaForm.level} onChange={(e) => setAreaForm({ ...areaForm, level: e.target.value, parentId: '' })}>
                <option value="CITY">{tr('مدينة', 'City')}</option>
                <option value="REGION">{tr('منطقة', 'Region')}</option>
                <option value="DISTRICT">{tr('حي', 'District')}</option>
              </Select>
            </Field>
            <Field label={tr('الأب', 'Parent')} className="col-4">
              <Select value={areaForm.parentId} onChange={(e) => setAreaForm({ ...areaForm, parentId: e.target.value })} disabled={areaForm.level === 'CITY'}>
                <option value="">—</option>
                {parentOptions(areaForm.level).map((a) => <option key={a.id} value={a.id}>{a.nameAr}</option>)}
              </Select>
            </Field>
            <Field label={tr('الاسم بالعربية', 'Arabic name')} required className="col-6"><Input value={areaForm.nameAr} required onChange={(e) => setAreaForm({ ...areaForm, nameAr: e.target.value })} /></Field>
            <Field label={tr('الاسم بالإنجليزية', 'English name')} required className="col-6"><Input value={areaForm.nameEn} required onChange={(e) => setAreaForm({ ...areaForm, nameEn: e.target.value })} /></Field>
          </div>
          <ErrorNote error={ferr} />
        </form>
      </Modal>

      <Modal open={creatingRoute} onClose={() => setCreatingRoute(false)} title={tr('خط سير جديد', 'New route')} footer={
        <>
          <Button variant="ghost" onClick={() => setCreatingRoute(false)}>{tr('إلغاء', 'Cancel')}</Button>
          <Button type="submit" form="route-form" loading={busy} icon="save">{tr('حفظ', 'Save')}</Button>
        </>
      }>
        <form id="route-form" onSubmit={createRoute}>
          <div className="form-grid">
            <Field label={tr('الكود', 'Code')} required className="col-4"><Input value={routeForm.code} required onChange={(e) => setRouteForm({ ...routeForm, code: e.target.value })} /></Field>
            <Field label={tr('المنطقة', 'Area')} className="col-4">
              <Select value={routeForm.geoAreaId} onChange={(e) => setRouteForm({ ...routeForm, geoAreaId: e.target.value })}>
                <option value="">—</option>
                {(areas.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.nameAr}</option>)}
              </Select>
            </Field>
            <Field label={tr('الاسم بالعربية', 'Arabic name')} required className="col-6"><Input value={routeForm.nameAr} required onChange={(e) => setRouteForm({ ...routeForm, nameAr: e.target.value })} /></Field>
            <Field label={tr('الاسم بالإنجليزية', 'English name')} required className="col-6"><Input value={routeForm.nameEn} required onChange={(e) => setRouteForm({ ...routeForm, nameEn: e.target.value })} /></Field>
          </div>
          <ErrorNote error={ferr} />
        </form>
      </Modal>

      <Modal open={Boolean(assignRoute)} onClose={() => setAssignRoute(null)} title={tr('تعيين عملاء للخط', 'Assign customers to route')} footer={
        <>
          <Button variant="ghost" onClick={() => setAssignRoute(null)}>{tr('إلغاء', 'Cancel')}</Button>
          <Button loading={busy} onClick={assign}>{tr('حفظ', 'Save')}</Button>
        </>
      }>
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          {(customers.data?.items ?? []).map((c) => (
            <label key={c.id} className="check" style={{ display: 'flex', padding: '6px 4px' }}>
              <input type="checkbox" checked={selectedCusts.has(c.id)} onChange={(e) => {
                const n = new Set(selectedCusts);
                if (e.target.checked) n.add(c.id); else n.delete(c.id);
                setSelectedCusts(n);
              }} />
              <span>{c.code} · {c.nameAr}</span>
            </label>
          ))}
        </div>
        <ErrorNote error={ferr} />
      </Modal>
    </>
  );
}
