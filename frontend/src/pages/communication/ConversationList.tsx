import React from 'react';
import { Plus } from 'lucide-react';
import { Button, Skeleton, ErrorState } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { formatDate } from '@/i18n';
import type { Conversation } from './messages.types';

interface ConversationListProps {
  conversations: Conversation[];
  activeChatId: string | null;
  onSelect: (userId: string) => void;
  onStartNewChat: () => void;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  className?: string;
}

export default function ConversationList({
  conversations,
  activeChatId,
  onSelect,
  onStartNewChat,
  isLoading,
  isError,
  onRetry,
  className,
}: ConversationListProps) {
  return (
    <div className={`glass-card rounded-2xl flex flex-col overflow-hidden ${className || ''}`}>
      <div className="p-5 border-b border-slate-200/50 dark:border-white/5">
        <Button variant="gradient" onClick={onStartNewChat} fullWidth leftIcon={<Plus className="w-5 h-5" />}>
          Start New Chat
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {isError ? (
          <ErrorState compact message="Could not load conversations." onRetry={onRetry} />
        ) : isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-3">
              <Skeleton className="w-12 h-12 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))
        ) : conversations.length === 0 ? (
          <EmptyState compact title="No conversations yet" description="Start a new chat to reach a colleague, teacher, or guardian." />
        ) : (
          conversations.map((conv) => (
            <button
              type="button"
              key={conv.user.id}
              onClick={() => onSelect(conv.user.id)}
              className={`w-full flex items-center gap-4 p-3 rounded-2xl cursor-pointer transition-all text-left ${
                activeChatId === conv.user.id
                  ? 'bg-primary-50 dark:bg-primary-500/20 border border-primary-200 dark:border-primary-500/30'
                  : 'hover:bg-slate-50 dark:hover:bg-white/5 border border-transparent'
              }`}
            >
              <div className="relative shrink-0">
                {conv.user.avatarUrl ? (
                  <img src={conv.user.avatarUrl} alt={conv.user.firstName} className="w-12 h-12 rounded-full object-cover border border-slate-200 dark:border-white/10" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 font-bold border border-slate-200 dark:border-white/10">
                    {conv.user.firstName.charAt(0)}{conv.user.lastName.charAt(0)}
                  </div>
                )}
                {conv.unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900">
                    {conv.unreadCount}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">{conv.user.firstName} {conv.user.lastName}</h4>
                <p className={`text-xs truncate ${conv.unreadCount > 0 ? 'text-slate-800 dark:text-white font-medium' : 'text-slate-500 dark:text-slate-400'}`}>
                  {conv.latestMessage?.content || 'New conversation'}
                </p>
              </div>
              {conv.latestMessage && (
                <span className="text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap shrink-0">
                  {formatDate(conv.latestMessage.createdAt)}
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
