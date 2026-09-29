import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import { Alert, Button, Modal } from '@/components/ui';
import { useT } from '@/i18n';

/** Shows a secret exactly once with a copy button. Closing it discards the value. */
export const SecretRevealModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title: string;
  label: string;
  secret: string | null;
  hint?: React.ReactNode;
}> = ({ isOpen, onClose, title, label, secret, hint }) => {
  const t = useT();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      toast.success(t('Copied to clipboard'));
    } catch {
      toast.error(t('Could not copy — select the text and copy it manually'));
    }
  };

  const close = () => {
    setCopied(false);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title={title}
      size="lg"
      closeOnBackdrop={false}
      footer={
        <div className="flex justify-end">
          <Button onClick={close}>{copied ? t('Done') : t('I have saved it')}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Alert tone="warning" title={t('Copy it now')}>
          {t('For security this value is shown only once. If you lose it, create a new one.')}
        </Alert>
        <div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{label}</p>
          <div className="flex items-stretch gap-2">
            <code className="flex-1 min-w-0 break-all rounded-lg bg-slate-100 dark:bg-white/5 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100 select-all">
              {secret}
            </code>
            <Button type="button" variant="outline" size="icon" aria-label={t('Copy')} onClick={copy}>
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
        </div>
        {hint && <div className="text-sm text-slate-600 dark:text-slate-400">{hint}</div>}
      </div>
    </Modal>
  );
};
