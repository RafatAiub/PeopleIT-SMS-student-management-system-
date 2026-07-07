import prisma from '../../config/prisma';
import { SendMessageDto } from './messages.dto';

export class MessagesRepository {
  async findInbox(institutionId: string, userId: string) {
    return prisma.message.findMany({
      where: {
        institutionId,
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, role: true } },
        receiver: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getConversations(institutionId: string, userId: string) {
    // A simple query to get the latest messages per user conversation.
    // For large scale, a custom raw query might be better, but Prisma's findMany with distinct is not fully supported for this exact use-case.
    // We will fetch all messages for the user and group them in JS.
    const messages = await prisma.message.findMany({
      where: {
        institutionId,
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, role: true } },
        receiver: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const conversationsMap = new Map<string, any>();
    for (const msg of messages) {
      const otherUser = msg.senderId === userId ? msg.receiver : msg.sender;
      if (!otherUser) continue;
      
      if (!conversationsMap.has(otherUser.id)) {
        conversationsMap.set(otherUser.id, {
          user: otherUser,
          latestMessage: msg,
          unreadCount: msg.receiverId === userId && !msg.read ? 1 : 0
        });
      } else {
        if (msg.receiverId === userId && !msg.read) {
          const conv = conversationsMap.get(otherUser.id);
          conv.unreadCount += 1;
        }
      }
    }
    return Array.from(conversationsMap.values());
  }

  async getConversationHistory(institutionId: string, userId: string, otherUserId: string) {
    // Mark as read
    await prisma.message.updateMany({
      where: {
        institutionId,
        receiverId: userId,
        senderId: otherUserId,
        read: false
      },
      data: { read: true }
    });

    return prisma.message.findMany({
      where: {
        institutionId,
        OR: [
          { senderId: userId, receiverId: otherUserId },
          { senderId: otherUserId, receiverId: userId },
        ],
      },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, role: true } },
        receiver: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, role: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createMessage(institutionId: string, senderId: string, data: SendMessageDto) {
    const msg = await prisma.message.create({
      data: {
        institutionId,
        senderId,
        receiverId: data.receiverId,
        content: data.content,
      },
    });
    return prisma.message.findUnique({
      where: { id: msg.id },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, role: true } },
        receiver: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, role: true } },
      }
    });
  }
}

export const messagesRepository = new MessagesRepository();
