import React, { useState } from 'react';
import { Plus, Trash2, Settings2 } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Checkbox, Input } from '../../components/ui/Input';
import { useT } from '../../i18n';
import { ALL_DAYS, dayLabel, type PeriodDef, type TimetableSettings } from './timetableSettings';

interface TimetableSettingsPopoverProps {
  settings: TimetableSettings;
  onSave: (settings: TimetableSettings) => void;
}

/**
 * Compact settings dialog for which days/periods the grid displays. Built as
 * a small Modal (not a bespoke floating popover) so it gets the shared focus
 * trap, Escape handling and mobile bottom-sheet behaviour for free.
 */
export default function TimetableSettingsPopover({ settings, onSave }: TimetableSettingsPopoverProps) {
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<TimetableSettings>(settings);

  const open = () => {
    setDraft(settings);
    setIsOpen(true);
  };

  const toggleDay = (day: string) => {
    setDraft((prev) => ({
      ...prev,
      days: prev.days.includes(day) ? prev.days.filter((d) => d !== day) : [...prev.days, day],
    }));
  };

  const updatePeriod = (id: string, patch: Partial<PeriodDef>) => {
    setDraft((prev) => ({ ...prev, periods: prev.periods.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  };

  const addPeriod = () => {
    setDraft((prev) => ({
      ...prev,
      periods: [
        ...prev.periods,
        { id: `custom-${Date.now()}`, label: `Period ${prev.periods.length + 1}`, start: '13:00', end: '13:45' },
      ],
    }));
  };

  const removePeriod = (id: string) => {
    setDraft((prev) => ({ ...prev, periods: prev.periods.filter((p) => p.id !== id) }));
  };

  const handleSave = () => {
    onSave(draft);
    setIsOpen(false);
  };

  return (
    <>
      <Button type="button" variant="secondary" size="md" onClick={open} leftIcon={<Settings2 className="w-4 h-4" />}>
        {t('Timetable settings')}
      </Button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={t('Timetable settings')}
        description={t('Choose which school days and period rows this grid shows. Saved on this device only.')}
        size="lg"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setIsOpen(false)}>{t('Cancel')}</Button>
            <Button type="button" variant="primary" onClick={handleSave}>{t('Save')}</Button>
          </>
        }
      >
        <div className="space-y-6">
          <div>
            <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
              {t('School days')}
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ALL_DAYS.map((day) => (
                <Checkbox
                  key={day}
                  label={dayLabel(day)}
                  checked={draft.days.includes(day)}
                  onChange={() => toggleDay(day)}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                {t('Period rows')}
              </h4>
              <Button type="button" variant="outline" size="sm" onClick={addPeriod} leftIcon={<Plus className="w-3.5 h-3.5" />}>
                {t('Add row')}
              </Button>
            </div>
            <div className="space-y-2">
              {draft.periods.map((p) => (
                <div key={p.id} className="flex flex-wrap items-end gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/40">
                  <Input
                    label={t('Label')}
                    value={p.label}
                    onChange={(e) => updatePeriod(p.id, { label: e.target.value })}
                    containerClassName="flex-1 min-w-[140px]"
                  />
                  <Input
                    label={t('Start')}
                    type="time"
                    value={p.start}
                    onChange={(e) => updatePeriod(p.id, { start: e.target.value })}
                    containerClassName="w-32"
                  />
                  <Input
                    label={t('End')}
                    type="time"
                    value={p.end}
                    onChange={(e) => updatePeriod(p.id, { end: e.target.value })}
                    containerClassName="w-32"
                  />
                  <Checkbox
                    label={t('Break')}
                    checked={!!p.isBreak}
                    onChange={(e) => updatePeriod(p.id, { isBreak: e.target.checked })}
                    className="mb-2"
                  />
                  <Button
                    type="button"
                    variant="danger-soft"
                    size="icon-sm"
                    aria-label={t('Remove row')}
                    onClick={() => removePeriod(p.id)}
                    disabled={draft.periods.length <= 1}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
