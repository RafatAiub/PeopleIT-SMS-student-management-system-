import React, { useState } from 'react';
import { Send } from 'lucide-react';
import { Avatar, Badge, Button, Textarea } from '@/components/ui';
import { formatDate, useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { personName, type TicketDetail, type TicketPerson } from './support.api';

const Bubble: React.FC<{ author: TicketPerson; body: string; at: string; mine: boolean; platform: boolean }> = ({ author, body, at, mine, platform }) => {
  const t = useT();
  return (
    <li className={cn('flex gap-2.5', mine && 'flex-row-reverse')}>
      <Avatar name={personName(author)} size="sm" />
      <div className={cn('max-w-[85%] min-w-0', mine && 'text-right')}>
        <p className="text-xs text-slate-500 mb-1">
          <span className="font-medium text-slate-700 dark:text-slate-300">{personName(author)}</span>
          {platform && (
            <Badge variant="primary" className="ml-1.5">
              {t('PeopleNIT Support')}
            </Badge>
          )}
          <span className="ml-1.5">{formatDate(at, true)}</span>
        </p>
        <div
          className={cn(
            'inline-block text-left rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words',
            mine ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-900 dark:bg-white/5 dark:text-slate-100',
          )}
        >
          {body}
        </div>
      </div>
    </li>
  );
};

/** Conversation view shared by the tenant drawer and the platform console. */
export const TicketThread: React.FC<{
  ticket: TicketDetail;
  viewerId: string | undefined;
  onReply?: (body: string) => Promise<void>;
  isReplying?: boolean;
  replyDisabledReason?: string;
}> = ({ ticket, viewerId, onReply, isReplying, replyDisabledReason }) => {
  const t = useT();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | undefined>();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onReply) return;
    if (!body.trim()) {
      setError(t('Message cannot be empty'));
      return;
    }
    setError(undefined);
    try {
      await onReply(body.trim());
      setBody('');
    } catch {
      // the caller shows the error; keep the draft so nothing typed is lost
    }
  };

  return (
    <div className="space-y-4">
      <ul className="space-y-4" aria-label={t('Conversation')}>
        <Bubble author={ticket.createdBy} body={ticket.description} at={ticket.createdAt} mine={ticket.createdBy.id === viewerId} platform={false} />
        {ticket.messages.map((m) => (
          <Bubble key={m.id} author={m.author} body={m.body} at={m.createdAt} mine={m.author.id === viewerId} platform={m.author.role === 'SUPER_ADMIN'} />
        ))}
      </ul>
      {onReply &&
        (replyDisabledReason ? (
          <p className="text-sm text-slate-500">{replyDisabledReason}</p>
        ) : (
          <form onSubmit={submit} className="space-y-2" id="ticket-reply-form">
            <Textarea
              label={t('Reply')}
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              error={error}
              maxLength={10000}
              placeholder={t('Write a reply…')}
            />
            <div className="flex justify-end">
              <Button type="submit" isLoading={isReplying} leftIcon={<Send className="w-4 h-4" />}>
                {t('Send reply')}
              </Button>
            </div>
          </form>
        ))}
    </div>
  );
};
