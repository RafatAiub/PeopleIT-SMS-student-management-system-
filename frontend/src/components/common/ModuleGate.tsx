import React from 'react';
import { Navigate } from 'react-router-dom';
import { useModuleState } from '@/hooks/useModules';

/**
 * <ModuleGate module="islamic.donations"> … </ModuleGate>
 *
 * Renders its children only while the school has the module switched on.
 * - default: renders `fallback` (nothing) when off — for widgets and cards
 * - `redirectTo="/"`: navigates away when off — for whole pages/routes
 * While the switches are loading it renders nothing (no flash of a feature
 * that is about to disappear).
 */
export const ModuleGate: React.FC<{
  module: string | undefined;
  redirectTo?: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}> = ({ module, redirectTo, fallback = null, children }) => {
  const { enabled, isLoading } = useModuleState(module);
  if (!module) return <>{children}</>;
  if (isLoading) return null;
  if (!enabled) return redirectTo ? <Navigate to={redirectTo} replace /> : <>{fallback}</>;
  return <>{children}</>;
};

export default ModuleGate;
