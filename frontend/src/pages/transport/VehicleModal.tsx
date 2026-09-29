import React, { useEffect, useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input, Checkbox } from '../../components/ui/Input';

export interface VehicleFormValues {
  registrationNumber: string;
  capacity: number;
  driverName: string;
  driverPhone: string;
  isActive: boolean;
}

const EMPTY: VehicleFormValues = { registrationNumber: '', capacity: 40, driverName: '', driverPhone: '', isActive: true };

interface VehicleModalProps {
  isOpen: boolean;
  initialValues: VehicleFormValues | null;
  isEditing: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (values: VehicleFormValues) => Promise<void> | void;
}

export const VehicleModal: React.FC<VehicleModalProps> = ({ isOpen, initialValues, isEditing, isSaving, onClose, onSubmit }) => {
  const [values, setValues] = useState<VehicleFormValues>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      setValues(initialValues ?? EMPTY);
      setErrors({});
    }
  }, [isOpen, initialValues]);

  const validate = (v: VehicleFormValues) => {
    const next: Record<string, string> = {};
    if (!v.registrationNumber.trim()) next.registrationNumber = 'Registration number is required';
    if (!v.driverName.trim()) next.driverName = 'Driver name is required';
    if (!v.capacity || v.capacity < 1) next.capacity = 'Capacity must be at least 1';
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
      title={isEditing ? 'Edit Vehicle' : 'Add New Vehicle'}
      size="md"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="vehicle-form" variant="gradient" isLoading={isSaving}>
            {isEditing ? 'Save Changes' : 'Add Vehicle'}
          </Button>
        </>
      }
    >
      <form id="vehicle-form" onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Registration Number"
          required
          value={values.registrationNumber}
          onChange={(e) => setValues((p) => ({ ...p, registrationNumber: e.target.value }))}
          error={errors.registrationNumber}
        />
        <Input
          label="Driver Name"
          required
          value={values.driverName}
          onChange={(e) => setValues((p) => ({ ...p, driverName: e.target.value }))}
          error={errors.driverName}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Capacity"
            type="number"
            min={1}
            required
            value={values.capacity}
            onChange={(e) => setValues((p) => ({ ...p, capacity: parseInt(e.target.value, 10) || 0 }))}
            error={errors.capacity}
          />
          <Input
            label="Driver Phone"
            type="tel"
            helperText="Optional"
            value={values.driverPhone}
            onChange={(e) => setValues((p) => ({ ...p, driverPhone: e.target.value }))}
          />
        </div>
        {isEditing && (
          <Checkbox
            label="Active"
            description="Inactive vehicles are kept for records but should not be assigned to new routes."
            checked={values.isActive}
            onChange={(e) => setValues((p) => ({ ...p, isActive: e.target.checked }))}
          />
        )}
      </form>
    </Modal>
  );
};
