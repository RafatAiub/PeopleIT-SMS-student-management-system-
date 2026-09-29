import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Modal, Button, Input } from '../../components/ui';
import { useT } from '../../i18n';
import apiClient from '../../api/client';
import { TRANSPORT_KEY, errMsg } from './transport.queries';

/** Manual last-known location entry (the same endpoint a future GPS device would call). */
export const VehicleLocationModal: React.FC<{ vehicle: { id: string; registrationNumber: string } | null; onClose: () => void; onSaved?: () => void }> = ({ vehicle, onClose, onSaved }) => {
  const t = useT();
  const qc = useQueryClient();
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (vehicle) { setLat(''); setLng(''); setErrors({}); }
  }, [vehicle]);

  const save = useMutation({
    mutationFn: async (body: { lat: number; lng: number }) => (await apiClient.post(`/transport/vehicles/${vehicle!.id}/location`, body)).data.data,
    onSuccess: () => {
      toast.success(t('Location updated'));
      qc.invalidateQueries({ queryKey: [TRANSPORT_KEY] });
      onSaved?.();
      onClose();
    },
    onError: (e) => toast.error(errMsg(e, t('Could not update location'))),
  });

  const useMyLocation = () => {
    if (!navigator.geolocation) return toast.error(t('This browser cannot share its location'));
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLat(pos.coords.latitude.toFixed(6)); setLng(pos.coords.longitude.toFixed(6)); setLocating(false); },
      () => { toast.error(t('Could not get your location')); setLocating(false); },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    const la = Number(lat);
    const ln = Number(lng);
    if (lat.trim() === '' || isNaN(la) || Math.abs(la) > 90) next.lat = t('Latitude must be between -90 and 90');
    if (lng.trim() === '' || isNaN(ln) || Math.abs(ln) > 180) next.lng = t('Longitude must be between -180 and 180');
    setErrors(next);
    if (Object.keys(next).length) return;
    save.mutate({ lat: la, lng: ln });
  };

  return (
    <Modal
      isOpen={!!vehicle}
      onClose={onClose}
      title={t('Update vehicle location')}
      description={vehicle?.registrationNumber}
      size="sm"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" form="vehicle-location-form" variant="gradient" isLoading={save.isPending}>{t('Save location')}</Button>
        </>
      }
    >
      <form id="vehicle-location-form" onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <Input label={t('Latitude')} inputMode="decimal" required value={lat} onChange={(e) => setLat(e.target.value)} error={errors.lat} placeholder="23.8103" />
          <Input label={t('Longitude')} inputMode="decimal" required value={lng} onChange={(e) => setLng(e.target.value)} error={errors.lng} placeholder="90.4125" />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={useMyLocation} isLoading={locating}>{t('Use my current location')}</Button>
        <p className="text-xs text-slate-500 dark:text-slate-400">{t('Saved as the vehicle’s last-known position with the current time.')}</p>
      </form>
    </Modal>
  );
};
