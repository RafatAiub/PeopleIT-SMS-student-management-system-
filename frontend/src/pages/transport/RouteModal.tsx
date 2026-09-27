import React, { useEffect, useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input, Select, Checkbox } from '../../components/ui/Input';

export interface VehicleOption {
  id: string;
  registrationNumber: string;
}

export interface RouteFormValues {
  name: string;
  stops: string;
  startPoint: string;
  endPoint: string;
  distance: string;
  vehicleId: string;
  routeFare: number;
  isActive: boolean;
}

const EMPTY: RouteFormValues = { name: '', stops: '', startPoint: '', endPoint: '', distance: '', vehicleId: '', routeFare: 0, isActive: true };

interface RouteModalProps {
  isOpen: boolean;
  vehicles: VehicleOption[];
  initialValues: RouteFormValues | null;
  isEditing: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (values: RouteFormValues) => Promise<void> | void;
}

export const RouteModal: React.FC<RouteModalProps> = ({ isOpen, vehicles, initialValues, isEditing, isSaving, onClose, onSubmit }) => {
  const [values, setValues] = useState<RouteFormValues>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      setValues(initialValues ?? EMPTY);
      setErrors({});
    }
  }, [isOpen, initialValues]);

  const validate = (v: RouteFormValues) => {
    const next: Record<string, string> = {};
    if (!v.name.trim()) next.name = 'Route name is required';
    return next;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next = validate(values);
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    await onSubmit(values);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Route' : 'Add New Route'}
      size="md"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="route-form" variant="gradient" isLoading={isSaving}>
            {isEditing ? 'Save Changes' : 'Add Route'}
          </Button>
        </>
      }
    >
      <form id="route-form" onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Route Name"
          required
          value={values.name}
          onChange={(e) => setValues((p) => ({ ...p, name: e.target.value }))}
          error={errors.name}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Start Point"
            helperText="Optional"
            value={values.startPoint}
            onChange={(e) => setValues((p) => ({ ...p, startPoint: e.target.value }))}
          />
          <Input
            label="End Point"
            helperText="Optional"
            value={values.endPoint}
            onChange={(e) => setValues((p) => ({ ...p, endPoint: e.target.value }))}
          />
        </div>
        <Input
          label="Stops"
          value={values.stops}
          onChange={(e) => setValues((p) => ({ ...p, stops: e.target.value }))}
          placeholder="e.g. Gate 1, Central Park, Market Road"
          helperText="Comma-separated list of stop names — shown as a chip list wherever this route is displayed."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Distance"
            placeholder="e.g. 15 km"
            helperText="Optional"
            value={values.distance}
            onChange={(e) => setValues((p) => ({ ...p, distance: e.target.value }))}
          />
          <Input
            label="Monthly Fare (৳)"
            type="number"
            min={0}
            step="0.01"
            value={values.routeFare}
            onChange={(e) => setValues((p) => ({ ...p, routeFare: parseFloat(e.target.value) || 0 }))}
          />
        </div>
        <Select
          label="Vehicle"
          placeholder="No vehicle assigned"
          value={values.vehicleId}
          onChange={(e) => setValues((p) => ({ ...p, vehicleId: e.target.value }))}
          options={vehicles.map((v) => ({ value: v.id, label: v.registrationNumber }))}
        />
        {isEditing && (
          <Checkbox
            label="Active"
            description="Inactive routes are kept for records but should not be used for new assignments."
            checked={values.isActive}
            onChange={(e) => setValues((p) => ({ ...p, isActive: e.target.checked }))}
          />
        )}
      </form>
    </Modal>
  );
};
