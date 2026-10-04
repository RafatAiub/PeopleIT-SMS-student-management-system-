import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '@/api/client';
import { Card, CardHeader, Input, Button } from '@/components/ui';

/**
 * Change password — was previously not exposed anywhere in the UI even
 * though POST /users/change-password has existed on the backend all along.
 * Split out of SecuritySettings.tsx to keep that file under the ~600-line
 * guideline.
 */
export function ChangePasswordCard() {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [touched, setTouched] = useState<{ old?: boolean; next?: boolean; confirm?: boolean }>({});
  const [submitting, setSubmitting] = useState(false);

  const oldError = touched.old && !oldPassword ? 'Your current password is required.' : undefined;
  const newError =
    touched.next && newPassword.length > 0 && newPassword.length < 8
      ? 'New password must be at least 8 characters long.'
      : touched.next && !newPassword
        ? 'A new password is required.'
        : undefined;
  const confirmError =
    touched.confirm && confirmPassword && confirmPassword !== newPassword
      ? 'Passwords do not match.'
      : touched.confirm && !confirmPassword
        ? 'Please confirm your new password.'
        : undefined;

  const canSubmit = oldPassword.length > 0 && newPassword.length >= 8 && confirmPassword === newPassword;

  const reset = () => {
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setTouched({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ old: true, next: true, confirm: true });
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const { data } = await apiClient.post('/users/change-password', { oldPassword, newPassword });
      toast.success(data?.message || 'Password changed successfully');
      reset();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to change password. Check your current password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader
        icon={<Lock className="w-5 h-5" />}
        title="Change password"
        description="Choose a new password of at least 8 characters."
      />
      <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
        <Input
          id="change-password-old"
          type="password"
          label="Current password"
          autoComplete="current-password"
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, old: true }))}
          error={oldError}
        />
        <Input
          id="change-password-new"
          type="password"
          label="New password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, next: true }))}
          error={newError}
          helperText={!newError ? 'At least 8 characters.' : undefined}
        />
        <Input
          id="change-password-confirm"
          type="password"
          label="Confirm new password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
          error={confirmError}
        />
        <div className="flex justify-end">
          <Button type="submit" variant="gradient" isLoading={submitting} disabled={submitting}>
            {submitting ? 'Updating…' : 'Update password'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
