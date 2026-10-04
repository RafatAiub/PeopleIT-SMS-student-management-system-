import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Button, Input, Modal, Select, Textarea } from '@/components/ui';
import { useT } from '@/i18n';
import { errMsg, PRIORITY_LABEL, TICKET_PRIORITIES, useTicketMutations, type TicketDetail, type TicketPriority } from './support.api';

export const NewTicketModal: React.FC<{ isOpen: boolean; onClose: () => void; onCreated: (t: TicketDetail) => void }> = ({ isOpen, onClose, onCreated }) => {
  const t = useT();
  const { create } = useTicketMutations();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('NORMAL');
  const [errors, setErrors] = useState<{ subject?: string; description?: string }>({});

  const reset = () => {
    setSubject('');
    setDescription('');
    setPriority('NORMAL');
    setErrors({});
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (subject.trim().length < 4) next.subject = t('Subject must be at least 4 characters');
    if (description.trim().length < 10) next.description = t('Please describe the problem (at least 10 characters)');
    setErrors(next);
    if (Object.keys(next).length) return;
    try {
      const ticket = await create.mutateAsync({ subject: subject.trim(), description: description.trim(), priority });
      toast.success(t('Ticket created — our team will reply here'));
      reset();
      onClose();
      onCreated(ticket);
    } catch (err) {
      toast.error(errMsg(err, t('Could not create the ticket')));
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        reset();
        onClose();
      }}
      title={t('New support ticket')}
      description={t('Describe what went wrong or what you need help with.')}
      size="lg"
    >
      <form onSubmit={submit} className="space-y-4" id="new-ticket-form">
        <Input label={t('Subject')} value={subject} onChange={(e) => setSubject(e.target.value)} error={errors.subject} maxLength={160} required />
        <Textarea
          label={t('Description')}
          rows={6}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={errors.description}
          maxLength={10000}
          helperText={t('Include the page, what you clicked, and any error message you saw.')}
          required
        />
        <Select
          label={t('Priority')}
          value={priority}
          onChange={(e) => setPriority(e.target.value as TicketPriority)}
          options={TICKET_PRIORITIES.map((p) => ({ value: p, label: t(PRIORITY_LABEL[p]) }))}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button type="submit" isLoading={create.isPending}>
            {t('Submit ticket')}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
