import React, { useMemo, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { PageHeader } from '@/components/ui';
import ConversationList from './ConversationList';
import MessageThread from './MessageThread';
import NewChatModal from './NewChatModal';
import { useConversations, useConversationHistory, useSendMessage } from './messages.queries';
import type { Conversation, PendingMessage } from './messages.types';
import type { UserSearchResult } from './messages.queries';

let localIdCounter = 0;
const nextLocalId = () => `local-${Date.now()}-${localIdCounter++}`;

const Messages = () => {
  const { user } = useAuthStore();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [draftConversations, setDraftConversations] = useState<Conversation[]>([]);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  // Pending messages are keyed by the receiver's user id so switching threads
  // never mixes up which chat a retry/discard action applies to.
  const [pendingByChat, setPendingByChat] = useState<Record<string, PendingMessage[]>>({});

  const {
    data: serverConversations = [],
    isLoading: conversationsLoading,
    isError: conversationsError,
    refetch: refetchConversations,
  } = useConversations();

  const {
    data: historyMessages = [],
    isLoading: historyLoading,
    isError: historyError,
    refetch: refetchHistory,
  } = useConversationHistory(activeChatId);

  const sendMessage = useSendMessage();

  // Local "start a chat" placeholders stay visible only until the real
  // conversation (with an actual message) comes back from the server.
  const conversations = useMemo(() => {
    const visibleDrafts = draftConversations.filter(
      (d) => !serverConversations.some((c) => c.user.id === d.user.id)
    );
    return [...visibleDrafts, ...serverConversations];
  }, [draftConversations, serverConversations]);

  const activeUser = activeChatId ? conversations.find((c) => c.user.id === activeChatId)?.user ?? null : null;
  const activePending = activeChatId ? pendingByChat[activeChatId] || [] : [];

  const selectChat = (userId: string) => setActiveChatId(userId);
  const goBack = () => setActiveChatId(null);

  const startNewChat = (selectedUser: UserSearchResult) => {
    const alreadyKnown = conversations.some((c) => c.user.id === selectedUser.id);
    if (!alreadyKnown) {
      setDraftConversations((prev) => [{ user: selectedUser, latestMessage: null, unreadCount: 0 }, ...prev]);
    }
    setActiveChatId(selectedUser.id);
    setIsNewChatOpen(false);
  };

  const sendToChat = (receiverId: string, content: string) => {
    const localId = nextLocalId();
    setPendingByChat((prev) => ({
      ...prev,
      [receiverId]: [...(prev[receiverId] || []), { localId, content, createdAt: new Date().toISOString(), status: 'sending' }],
    }));

    sendMessage.mutate(
      { receiverId, content },
      {
        onSuccess: () => {
          setPendingByChat((prev) => ({
            ...prev,
            [receiverId]: (prev[receiverId] || []).filter((m) => m.localId !== localId),
          }));
        },
        onError: (error: any) => {
          const message =
            error?.response?.status === 400
              ? error.response?.data?.message || 'This message could not be sent.'
              : error?.response?.status === 404
                ? 'This person could not be found. They may no longer be part of your institution.'
                : error?.response?.data?.message || 'Failed to send message.';
          setPendingByChat((prev) => ({
            ...prev,
            [receiverId]: (prev[receiverId] || []).map((m) =>
              m.localId === localId ? { ...m, status: 'failed', errorMessage: message } : m
            ),
          }));
        },
      }
    );
  };

  const retrySend = (localId: string) => {
    if (!activeChatId) return;
    const pending = (pendingByChat[activeChatId] || []).find((m) => m.localId === localId);
    if (!pending) return;
    setPendingByChat((prev) => ({
      ...prev,
      [activeChatId]: (prev[activeChatId] || []).map((m) => (m.localId === localId ? { ...m, status: 'sending' } : m)),
    }));
    sendMessage.mutate(
      { receiverId: activeChatId, content: pending.content },
      {
        onSuccess: () => {
          setPendingByChat((prev) => ({
            ...prev,
            [activeChatId]: (prev[activeChatId] || []).filter((m) => m.localId !== localId),
          }));
        },
        onError: (error: any) => {
          const message = error?.response?.data?.message || 'Failed to send message.';
          setPendingByChat((prev) => ({
            ...prev,
            [activeChatId]: (prev[activeChatId] || []).map((m) =>
              m.localId === localId ? { ...m, status: 'failed', errorMessage: message } : m
            ),
          }));
        },
      }
    );
  };

  const dismissFailed = (localId: string) => {
    if (!activeChatId) return;
    setPendingByChat((prev) => ({
      ...prev,
      [activeChatId]: (prev[activeChatId] || []).filter((m) => m.localId !== localId),
    }));
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-8rem)]">
      <PageHeader title="Messages" description="Communicate directly with staff, teachers, and students." />

      <div className="flex-1 flex gap-6 overflow-hidden">
        <ConversationList
          conversations={conversations}
          activeChatId={activeChatId}
          onSelect={selectChat}
          onStartNewChat={() => setIsNewChatOpen(true)}
          isLoading={conversationsLoading}
          isError={conversationsError}
          onRetry={() => refetchConversations()}
          className={`w-full md:w-80 lg:w-96 shrink-0 ${activeChatId ? 'hidden md:flex' : 'flex'}`}
        />

        <MessageThread
          activeUser={activeUser}
          currentUserId={user?.id}
          messages={historyMessages}
          pendingMessages={activePending}
          isLoading={historyLoading}
          isError={historyError}
          onRetryLoad={() => refetchHistory()}
          onSend={(content) => activeChatId && sendToChat(activeChatId, content)}
          onRetrySend={retrySend}
          onDismissFailed={dismissFailed}
          onBack={goBack}
          className={`flex-1 ${activeChatId ? 'flex' : 'hidden md:flex'}`}
        />
      </div>

      <NewChatModal
        isOpen={isNewChatOpen}
        onClose={() => setIsNewChatOpen(false)}
        currentUserId={user?.id}
        onSelect={startNewChat}
      />
    </div>
  );
};

export default Messages;
