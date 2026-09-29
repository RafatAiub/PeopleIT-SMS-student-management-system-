export const MESSAGE_MAX_LENGTH = 5000;

export interface MessageUser {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  role: string;
}

export interface Message {
  id: string;
  content: string;
  senderId: string;
  receiverId: string;
  read: boolean;
  createdAt: string;
  sender?: MessageUser;
  receiver?: MessageUser;
}

export interface Conversation {
  user: MessageUser;
  latestMessage: Message | null;
  unreadCount: number;
}

/** A message the UI has sent but the server hasn't confirmed (or has rejected) yet. */
export interface PendingMessage {
  localId: string;
  content: string;
  createdAt: string;
  status: 'sending' | 'failed';
  errorMessage?: string;
}
