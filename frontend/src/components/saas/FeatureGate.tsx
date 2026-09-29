import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Skeleton, UpgradePrompt } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { useT } from '@/i18n';
import { useEntitlements } from './saas.api';

interface FeatureGateProps {
  /** Feature key, e.g. "library", "ai", "online_payments". */
  flag: string;
  children: React.ReactNode;
  /** Rendered instead of the UpgradePrompt when the feature is off. */
  fallback?: React.ReactNode;
  /** Override the prompt's description. */
  description?: string;
  /** Render nothing (instead of a prompt) when locked — for buttons/menu items. */
  hideWhenLocked?: boolean;
}

/**
 * Renders children only when the institution's plan includes `flag`.
 * Fails open: while loading a skeleton shows, and if entitlements can't be
 * loaded the children render (the backend's requireFeature is the real gate).
 */
export const FeatureGate: React.FC<FeatureGateProps> = ({ flag, children, fallback, description, hideWhenLocked }) => {
  const t = useT();
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const { data, isLoading, isError, isEnabled } = useEntitlements();

  if (isLoading) return hideWhenLocked ? null : <Skeleton className="h-24 w-full rounded-xl" />;
  if (isError || !data || isEnabled(flag)) return <>{children}</>;
  if (hideWhenLocked) return null;
  if (fallback !== undefined) return <>{fallback}</>;

  const label = data.features[flag]?.label ?? flag;
  // /billing is ADMIN-only; other roles are told to ask their admin.
  const canUpgrade = role === 'ADMIN';
  return (
    <UpgradePrompt
      feature={t(label)}
      description={
        description ??
        (canUpgrade
          ? t('Upgrade to unlock this module for your institution.')
          : t('Ask your institution administrator to upgrade the plan.'))
      }
      onUpgrade={canUpgrade ? () => navigate('/billing') : undefined}
    />
  );
};

export default FeatureGate;
