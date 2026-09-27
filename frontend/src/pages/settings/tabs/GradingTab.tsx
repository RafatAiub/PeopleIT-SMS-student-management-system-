import React from 'react';
import { GradingScalesPanel } from '../../grading/GradingScalesPanel';

/**
 * Settings → Grading (admins only; backend requireRole SUPER_ADMIN, ADMIN).
 * Register in Settings.tsx: add 'grading' to TabId, an admin nav item
 * `{ id: 'grading', label: 'Grading', icon: <Scale className="w-5 h-5" /> }`
 * and `{activeTab === 'grading' && isAdmin && <GradingTab />}`.
 */
const GradingTab: React.FC = () => <GradingScalesPanel />;

export default GradingTab;
