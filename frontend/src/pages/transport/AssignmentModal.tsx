import React, { useEffect, useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { StudentSearchInput, StudentSearchResult } from './StudentSearchInput';

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
}

interface AssignmentModalProps {
  isOpen: boolean;
  routes: RouteOption[];
  vehicles: VehicleOption[];
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (values: AssignmentFormValues) => Promise<void> | void;
}

export const AssignmentModal: React.FC<AssignmentModalProps> = ({ isOpen, routes, vehicles, isSaving, onClose, onSubmit }) => {
  const [student, setStudent] = useState<StudentSearchResult | null>(null);
  const [routeId, setRouteId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [pickupPoint, setPickupPoint] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      setStudent(null);
      setRouteId('');
      setVehicleId('');
      setPickupPoint('');
      setErrors({});
    }
  }, [isOpen]);

  // Pre-select the route's own vehicle as a convenience default, still
  // overridable — an assignment always records both explicitly.
  useEffect(() => {
    const route = routes.find((r) => r.id === routeId);
    if (route?.vehicleId) setVehicleId(route.vehicleId);
  }, [routeId, routes]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!student) next.studentId = 'Select a student';
    if (!routeId) next.routeId = 'Select a route';
    if (!vehicleId) next.vehicleId = 'Select a vehicle';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    await onSubmit({ studentId: student!.id, routeId, vehicleId, pickupPoint: pickupPoint.trim() });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Assign Student to Transport"
      size="md"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="assignment-form" variant="gradient" isLoading={isSaving}>Create Assignment</Button>
        </>
      }
    >
      <form id="assignment-form" onSubmit={handleSubmit} className="space-y-4">
        <StudentSearchInput value={student} onChange={setStudent} error={errors.studentId} required />
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
