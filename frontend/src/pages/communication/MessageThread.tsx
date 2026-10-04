import React, { useEffect, useRef, useState } from 'react';
import { Send, MessageSquare, ArrowLeft, AlertCircle, RotateCw } from 'lucide-react';
import { Skeleton, ErrorState } from '@/components/ui';
import { formatDate } from '@/i18n';
import { MESSAGE_MAX_LENGTH, type Message, type MessageUser, type PendingMessage } from './messages.types';

interface MessageThreadProps {
  activeUser: MessageUser | null;
  currentUserId?: string;
  messages: Message[];
  pendingMessages: PendingMessage[];
  isLoading: boolean;
  isError: boolean;
  onRetryLoad: () => void;
  onSend: (content: string) => void;
  onRetrySend: (localId: string) => void;
  onDismissFailed: (localId: string) => void;
  onBack: () => void;
  className?: string;
}

export default function MessageThread({
  activeUser,
  currentUserId,
  messages,
  pendingMessages,
  isLoading,
  isError,
  onRetryLoad,
  onSend,
  onRetrySend,
  onDismissFailed,
  onBack,
  className,
}: MessageThreadProps) {
  const [draft, setDraft] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingMessages]);

  useEffect(() => {
    setDraft('');
  }, [activeUser?.id]);

  const trimmed = draft.trim();
  const overLimit = draft.length > MESSAGE_MAX_LENGTH;
  const canSend = trimmed.length > 0 && !overLimit;

  const handleSend = () => {
    if (!canSend) return;
    onSend(trimmed);
    setDraft('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!activeUser) {
    return (
      <div className={`glass-card rounded-2xl flex flex-col overflow-hidden relative ${className || ''}`}>
        <div className="flex flex-col items-center justify-center h-full text-slate-500 p-8 text-center bg-slate-50/10 dark:bg-transparent">
          <div className="w-24 h-24 bg-slate-100 dark:bg-slate-800/50 rounded-full flex items-center justify-center mb-6 border border-slate-200 dark:border-white/5 shadow-inner">
            <MessageSquare className="w-10 h-10 text-slate-400 dark:text-slate-600" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Your Messages</h3>
          <p className="max-w-xs text-sm leading-relaxed text-slate-500">Select a conversation from the list or start a new one to begin chatting.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`glass-card rounded-2xl flex flex-col overflow-hidden relative ${className || ''}`}>
      <div className="p-4 sm:p-5 border-b border-slate-200/50 dark:border-white/5 flex items-center gap-3 sm:gap-4 bg-slate-50/50 dark:bg-slate-900/60 backdrop-blur-md sticky top-0 z-10">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to conversations"
          className="md:hidden p-2 -ml-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        {activeUser.avatarUrl ? (
          <img src={activeUser.avatarUrl} alt={activeUser.firstName} className="w-10 h-10 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 font-bold border border-slate-200 dark:border-transparent shrink-0">
            {activeUser.firstName.charAt(0)}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="font-bold text-slate-900 dark:text-white text-base sm:text-lg truncate">{activeUser.firstName} {activeUser.lastName}</h3>
          <p className="text-xs text-primary-600 dark:text-primary-400 font-medium tracking-wider uppercase">{activeUser.role}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {isError ? (
          <ErrorState message="Could not load this conversation." onRetry={onRetryLoad} />
        ) : isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-12 w-2/3 rounded-2xl" />
            <Skeleton className="h-12 w-1/2 rounded-2xl ml-auto" />
            <Skeleton className="h-12 w-3/5 rounded-2xl" />
          </div>
        ) : messages.length === 0 && pendingMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <MessageSquare className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-lg font-medium">Say hello to {activeUser.firstName}!</p>
            <p className="text-sm">Start the conversation by sending a message below.</p>
          </div>
        ) : (
          <>
            {messages.map((msg) => {
              const isMine = msg.senderId === currentUserId;
              return (
                <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] sm:max-w-[70%] rounded-3xl px-5 py-3 ${
                      isMine
                        ? 'bg-primary-600 text-white rounded-br-sm shadow-lg shadow-primary-500/20'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-sm border border-slate-200 dark:border-white/5 shadow-xs'
                    }`}
                  >
                    <p className="text-sm md:text-base leading-relaxed whitespace-pre-wrap wrap-break-word">{msg.content}</p>
                    <span className={`text-[10px] opacity-60 mt-1.5 block ${isMine ? 'text-right' : 'text-left'}`}>
                      {formatDate(msg.createdAt, true)}
                    </span>
                  </div>
                </div>
              );
            })}
            {pendingMessages.map((pm) => (
              <div key={pm.localId} className="flex justify-end">
                <div className="max-w-[85%] sm:max-w-[70%]">
                  <div
                    className={`rounded-3xl rounded-br-sm px-5 py-3 ${
                      pm.status === 'failed'
                        ? 'bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300'
                        : 'bg-primary-600/70 text-white'
                    }`}
                  >
                    <p className="text-sm md:text-base leading-relaxed whitespace-pre-wrap wrap-break-word">{pm.content}</p>
                    <span className="text-[10px] opacity-70 mt-1.5 block text-right">
                      {pm.status === 'failed' ? 'Not sent' : 'Sending…'}
                    </span>
                  </div>
                  {pm.status === 'failed' && (
                    <div className="flex items-center justify-end gap-2 mt-1.5 text-xs">
                      <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {pm.errorMessage || 'Failed to send'}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRetrySend(pm.localId)}
                        className="inline-flex items-center gap-1 font-semibold text-primary-600 dark:text-primary-400 hover:underline"
                      >
                        <RotateCw className="w-3.5 h-3.5" /> Retry
                      </button>
                      <button
                        type="button"
                        onClick={() => onDismissFailed(pm.localId)}
                        className="font-semibold text-slate-500 dark:text-slate-400 hover:underline"
                      >
                        Discard
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 sm:p-5 bg-slate-50/50 dark:bg-slate-900/60 border-t border-slate-200/50 dark:border-white/5 backdrop-blur-md">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <textarea
              aria-label="Message"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message... (Enter to send, Shift+Enter for a new line)"
              rows={1}
              className="input-field px-5 py-4 resize-none min-h-0 max-h-40"
            />
            <div className={`mt-1 text-right text-[11px] tabular-nums ${overLimit ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-slate-400 dark:text-slate-500'}`}>
              {draft.length}/{MESSAGE_MAX_LENGTH}
            </div>
          </div>
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            aria-label="Send message"
            className="p-4 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-2xl transition-all shadow-sm shrink-0"
          >
            <Send className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
}
