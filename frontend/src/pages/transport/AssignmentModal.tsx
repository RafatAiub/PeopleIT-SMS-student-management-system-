import React, { useEffect, useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { StudentSearchInput, StudentSearchResult } from './StudentSearchInput';
import { useRouteStops } from './transport.queries';

export interface RouteOption {
  id: string;
  name: string;
  vehicleId?: string | null;
}

export interface VehicleOption {
  id: string;
  registrationNumber: string;
}

export interface AssignmentFormValues {
  studentId: string;
  routeId: string;
  vehicleId: string;
  pickupPoint: string;
  /** Structured stop on the chosen route ('' = none). */
  stopId: string;
}

/** Existing assignment being edited — the student is fixed, everything else can change. */
export interface AssignmentEditTarget {
  id: string;
  studentName: string;
  routeId: string;
  vehicleId: string;
  pickupPoint: string | null;
  stopId: string | null;
}

interface AssignmentModalProps {
  isOpen: boolean;
  routes: RouteOption[];
  vehicles: VehicleOption[];
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (values: AssignmentFormValues) => Promise<void> | void;
  editing?: AssignmentEditTarget | null;
}

export const AssignmentModal: React.FC<AssignmentModalProps> = ({ isOpen, routes, vehicles, isSaving, onClose, onSubmit, editing }) => {
  const [student, setStudent] = useState<StudentSearchResult | null>(null);
  const [routeId, setRouteId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [pickupPoint, setPickupPoint] = useState('');
  const [stopId, setStopId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const stops = useRouteStops(isOpen ? routeId : null);

  useEffect(() => {
    if (isOpen) {
      setStudent(null);
      setRouteId(editing?.routeId ?? '');
      setVehicleId(editing?.vehicleId ?? '');
      setPickupPoint(editing?.pickupPoint ?? '');
      setStopId(editing?.stopId ?? '');
      setErrors({});
    }
  }, [isOpen, editing]);

  // Pre-select the route's own vehicle as a convenience default, still
  // overridable — an assignment always records both explicitly.
  useEffect(() => {
    const route = routes.find((r) => r.id === routeId);
    if (route?.vehicleId) setVehicleId(route.vehicleId);
  }, [routeId, routes]);

  // A stop belongs to one route — clear it when the route changes.
  useEffect(() => {
    if (stops.data && stopId && !stops.data.some((s) => s.id === stopId)) setStopId('');
  }, [stops.data, stopId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!student && !editing) next.studentId = 'Select a student';
    if (!routeId) next.routeId = 'Select a route';
    if (!vehicleId) next.vehicleId = 'Select a vehicle';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    await onSubmit({ studentId: editing ? '' : student!.id, routeId, vehicleId, pickupPoint: pickupPoint.trim(), stopId });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? 'Edit Transport Assignment' : 'Assign Student to Transport'}
      description={editing ? editing.studentName : undefined}
      size="md"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="assignment-form" variant="gradient" isLoading={isSaving}>{editing ? 'Save Changes' : 'Create Assignment'}</Button>
        </>
      }
    >
      <form id="assignment-form" onSubmit={handleSubmit} className="space-y-4">
        {!editing && <StudentSearchInput value={student} onChange={setStudent} error={errors.studentId} required />}
        <Select
          label="Route"
          required
          value={routeId}
          onChange={(e) => setRouteId(e.target.value)}
          error={errors.routeId}
          placeholder={routes.length === 0 ? 'No routes available' : 'Select a route'}
          options={routes.map((r) => ({ value: r.id, label: r.name }))}
        />
        <Select
          label="Vehicle"
          required
          value={vehicleId}
          onChange={(e) => setVehicleId(e.target.value)}
          error={errors.vehicleId}
          placeholder={vehicles.length === 0 ? 'No vehicles available' : 'Select a vehicle'}
          options={vehicles.map((v) => ({ value: v.id, label: v.registrationNumber }))}
        />
        {routeId && (
          <Select
            label="Stop"
            value={stopId}
            onChange={(e) => setStopId(e.target.value)}
            placeholder={stops.isLoading ? 'Loading stops…' : (stops.data?.length ?? 0) === 0 ? 'No structured stops on this route' : 'No stop selected'}
            options={(stops.data ?? []).map((s) => ({ value: s.id, label: `${s.sequence}. ${s.name}${s.pickupTime ? ` (${s.pickupTime})` : ''}` }))}
            helperText={stops.isError ? 'Could not load stops for this route' : 'Optional — structured stops are managed from the route\'s Stops panel.'}
          />
        )}
        <Input
          label="Pickup Point"
          helperText="Optional"
          value={pickupPoint}
          onChange={(e) => setPickupPoint(e.target.value)}
        />
      </form>
    </Modal>
  );
};
