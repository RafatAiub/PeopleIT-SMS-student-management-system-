import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { GripVertical, ChevronUp, ChevronDown, Pencil, Trash2, Plus, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';
import { Drawer, Button, Input, Alert, SkeletonText, ErrorState, Badge } from '../../components/ui';
import { EmptyState } from '../../components/common/EmptyState';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { useT } from '../../i18n';
import apiClient from '../../api/client';
import { StopsChips } from './StopsChips';
import { TRANSPORT_KEY, errMsg, useRouteStops, type TransportStop } from './transport.queries';

interface Props {
  route: { id: string; name: string; stops?: string | null } | null;
  onClose: () => void;
  /** Called after any change so the parent can refresh stop counts. */
  onChanged?: () => void;
}

interface StopForm {
  name: string;
  pickupTime: string;
  dropTime: string;
  lat: string;
  lng: string;
}
const EMPTY: StopForm = { name: '', pickupTime: '', dropTime: '', lat: '', lng: '' };

const moveItem = <T,>(list: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = list.slice();
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
};

/**
 * Structured stops for one route: add / edit / delete, and reorder by
 * dragging the handle (mouse) or with the up/down buttons — also Alt+↑ /
 * Alt+↓ while a stop row is focused. The order is saved immediately.
 */
export const RouteStopsDrawer: React.FC<Props> = ({ route, onClose, onChanged }) => {
  const t = useT();
  const qc = useQueryClient();
  const stopsQuery = useRouteStops(route?.id);
  const [order, setOrder] = useState<TransportStop[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<StopForm>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState<TransportStop | null>(null);
  const [announce, setAnnounce] = useState('');

  useEffect(() => {
    if (stopsQuery.data) setOrder(stopsQuery.data);
  }, [stopsQuery.data]);
  useEffect(() => {
    if (route) { setEditingId(null); setForm(EMPTY); setErrors({}); }
  }, [route]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [TRANSPORT_KEY] });
    onChanged?.();
  };

  const reorder = useMutation({
    mutationFn: async (ids: string[]) => (await apiClient.put(`/transport/routes/${route!.id}/stops/order`, { stopIds: ids })).data.data,
    onSuccess: invalidate,
    onError: (e) => {
      toast.error(errMsg(e, t('Could not save the new order')));
      if (stopsQuery.data) setOrder(stopsQuery.data);
    },
  });
  const save = useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      editingId === 'new'
        ? (await apiClient.post(`/transport/routes/${route!.id}/stops`, body)).data.data
        : (await apiClient.put(`/transport/stops/${editingId}`, body)).data.data,
    onSuccess: () => {
      toast.success(editingId === 'new' ? t('Stop added') : t('Stop updated'));
      setEditingId(null);
      setForm(EMPTY);
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e, t('Could not save the stop'))),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => (await apiClient.delete(`/transport/stops/${id}`)).data.data,
    onSuccess: (res: { clearedAssignments?: number }) => {
      toast.success(res?.clearedAssignments ? t('Stop deleted — {n} assignment(s) no longer have a stop', { n: res.clearedAssignments }) : t('Stop deleted'));
      setDeleting(null);
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e, t('Could not delete the stop'))),
  });

  const commitOrder = (next: TransportStop[], movedName?: string, pos?: number) => {
    setOrder(next);
    if (movedName && pos !== undefined) setAnnounce(t('{name} moved to position {n}', { name: movedName, n: pos + 1 }));
    reorder.mutate(next.map((s) => s.id));
  };

  const move = (index: number, delta: number) => {
    const to = index + delta;
    if (to < 0 || to >= order.length) return;
    commitOrder(moveItem(order, index, to), order[index].name, to);
  };

  const startEdit = (s: TransportStop | null) => {
    setErrors({});
    if (s) {
      setEditingId(s.id);
      setForm({ name: s.name, pickupTime: s.pickupTime || '', dropTime: s.dropTime || '', lat: s.lat?.toString() ?? '', lng: s.lng?.toString() ?? '' });
    } else {
      setEditingId('new');
      setForm(EMPTY);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = t('Stop name is required');
    const hasLat = form.lat.trim() !== '';
    const hasLng = form.lng.trim() !== '';
    if (hasLat !== hasLng) next.lng = t('Enter both latitude and longitude, or neither');
    if (hasLat && (isNaN(Number(form.lat)) || Math.abs(Number(form.lat)) > 90)) next.lat = t('Latitude must be between -90 and 90');
    if (hasLng && (isNaN(Number(form.lng)) || Math.abs(Number(form.lng)) > 180)) next.lng = t('Longitude must be between -180 and 180');
    setErrors(next);
    if (Object.keys(next).length) return;
    save.mutate({
      name: form.name.trim(),
      pickupTime: form.pickupTime || null,
      dropTime: form.dropTime || null,
      lat: hasLat ? Number(form.lat) : null,
      lng: hasLng ? Number(form.lng) : null,
    });
  };

  const stopForm = (
    <form onSubmit={submit} className="rounded-lg border border-primary-200 dark:border-primary-500/30 p-3 space-y-3" noValidate>
      <Input label={t('Stop name')} required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} error={errors.name} autoFocus />
      <div className="grid grid-cols-2 gap-3">
        <Input label={t('Pickup time')} type="time" value={form.pickupTime} onChange={(e) => setForm((f) => ({ ...f, pickupTime: e.target.value }))} />
        <Input label={t('Drop time')} type="time" value={form.dropTime} onChange={(e) => setForm((f) => ({ ...f, dropTime: e.target.value }))} />
        <Input label={t('Latitude')} inputMode="decimal" value={form.lat} onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))} error={errors.lat} helperText={t('Optional')} />
        <Input label={t('Longitude')} inputMode="decimal" value={form.lng} onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))} error={errors.lng} helperText={t('Optional')} />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => { setEditingId(null); setForm(EMPTY); }}>{t('Cancel')}</Button>
        <Button type="submit" variant="gradient" size="sm" isLoading={save.isPending}>{editingId === 'new' ? t('Add stop') : t('Save stop')}</Button>
      </div>
    </form>
  );

  return (
    <Drawer
      isOpen={!!route}
      onClose={onClose}
      title={t('Stops — {name}', { name: route?.name ?? '' })}
      description={t('Ordered pickup / drop points. Drag the handle or use the arrows to reorder.')}
      width="lg"
    >
      <div className="space-y-4">
        {route?.stops && route.stops !== 'Direct Route' && (
          <Alert tone="info" title={t('Free-text stops (legacy)')}>
            <p className="mb-2">{t('Structured stops below supersede the free-text list. The old text is kept unchanged and still shown on the route.')}</p>
            <StopsChips stops={route.stops} />
          </Alert>
        )}

        <p className="sr-only" aria-live="polite">{announce}</p>

        {stopsQuery.isLoading ? (
          <SkeletonText lines={5} />
        ) : stopsQuery.isError ? (
          <ErrorState message={t('Could not load stops.')} onRetry={() => stopsQuery.refetch()} />
        ) : order.length === 0 && editingId !== 'new' ? (
          <EmptyState
            compact
            icon={<MapPin className="w-8 h-8 text-slate-400" />}
            title={t('No structured stops yet')}
            description={t('Add stops in the order the vehicle visits them.')}
            action={<Button size="sm" variant="gradient" leftIcon={<Plus className="w-4 h-4" />} onClick={() => startEdit(null)}>{t('Add stop')}</Button>}
          />
        ) : (
          <ol className="space-y-2" aria-label={t('Route stops in order')}>
            {order.map((s, i) =>
              editingId === s.id ? (
                <li key={s.id}>{stopForm}</li>
              ) : (
                <li
                  key={s.id}
                  tabIndex={0}
                  aria-label={t('Stop {n}: {name}. Alt plus arrow keys to move.', { n: i + 1, name: s.name })}
                  onKeyDown={(e) => {
                    if (!e.altKey) return;
                    if (e.key === 'ArrowUp') { e.preventDefault(); move(i, -1); }
                    if (e.key === 'ArrowDown') { e.preventDefault(); move(i, 1); }
                  }}
                  onDragOver={(e) => { if (dragIndex !== null) e.preventDefault(); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragIndex !== null && dragIndex !== i) commitOrder(moveItem(order, dragIndex, i), order[dragIndex].name, i);
                    setDragIndex(null);
                  }}
                  className={`flex items-center gap-2 rounded-lg border p-2 sm:p-3 bg-white dark:bg-white/3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                    dragIndex === i ? 'opacity-50 border-primary-400' : 'border-slate-200 dark:border-white/10'
                  }`}
                >
                  <span
                    draggable
                    onDragStart={(e) => { setDragIndex(i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', s.id); }}
                    onDragEnd={() => setDragIndex(null)}
                    className="hidden sm:flex cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    aria-hidden
                    title={t('Drag to reorder')}
                  >
                    <GripVertical className="w-4 h-4" />
                  </span>
                  <span className="w-6 h-6 rounded-full bg-primary-50 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300 text-xs font-semibold flex items-center justify-center shrink-0 tabular-nums">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{s.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {[s.pickupTime && t('Pickup {time}', { time: s.pickupTime }), s.dropTime && t('Drop {time}', { time: s.dropTime }), s.lat !== null && s.lng !== null && `${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}`]
                        .filter(Boolean)
                        .join(' · ') || t('No times set')}
                    </p>
                  </div>
                  {(s._count?.assignments ?? 0) > 0 && <Badge variant="info" className="hidden sm:inline-flex">{t('{n} students', { n: s._count!.assignments })}</Badge>}
                  <div className="flex items-center shrink-0">
                    <Button type="button" size="icon-sm" variant="ghost" aria-label={t('Move {name} up', { name: s.name })} disabled={i === 0 || reorder.isPending} onClick={() => move(i, -1)}><ChevronUp className="w-4 h-4" /></Button>
                    <Button type="button" size="icon-sm" variant="ghost" aria-label={t('Move {name} down', { name: s.name })} disabled={i === order.length - 1 || reorder.isPending} onClick={() => move(i, 1)}><ChevronDown className="w-4 h-4" /></Button>
                    <Button type="button" size="icon-sm" variant="ghost" aria-label={t('Edit {name}', { name: s.name })} onClick={() => startEdit(s)}><Pencil className="w-4 h-4" /></Button>
                    <Button type="button" size="icon-sm" variant="ghost" aria-label={t('Delete {name}', { name: s.name })} onClick={() => setDeleting(s)}><Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" /></Button>
                  </div>
                </li>
              ),
            )}
            {editingId === 'new' && <li>{stopForm}</li>}
          </ol>
        )}

        {order.length > 0 && editingId === null && (
          <Button variant="outline" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => startEdit(null)}>{t('Add stop')}</Button>
        )}
      </div>

      <ConfirmModal
        isOpen={!!deleting}
        title={t('Delete stop')}
        message={t('Delete "{name}"? Students assigned to this stop keep their assignment but will have no stop selected.', { name: deleting?.name ?? '' })}
        confirmLabel={t('Delete')}
        variant="danger"
        isLoading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </Drawer>
  );
};
