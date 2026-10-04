import { messagesRepository } from './messages.repository';
import { SendMessageDto } from './messages.dto';
import { prisma } from '../../config/prisma';
import { BadRequestError, NotFoundError } from '../../utils/AppError';

export class MessagesService {
  async getInbox(institutionId: string, userId: string) {
    return messagesRepository.findInbox(institutionId, userId);
  }

  async getConversations(institutionId: string, userId: string) {
    return messagesRepository.getConversations(institutionId, userId);
  }

  async getConversationHistory(institutionId: string, userId: string, otherUserId: string) {
    return messagesRepository.getConversationHistory(institutionId, userId, otherUserId);
  }

  async sendMessage(institutionId: string, senderId: string, data: SendMessageDto) {
    // F6: the receiver must be a real user of this same institution, and a
    // user may not message themselves.
    if (data.receiverId === senderId) {
      throw new BadRequestError('You cannot send a message to yourself');
    }

    const receiver = await prisma.user.findFirst({
      where: { id: data.receiverId, institutionId },
      select: { id: true },
    });
    if (!receiver) {
      throw new NotFoundError('Receiver not found in your institution');
    }

    return messagesRepository.createMessage(institutionId, senderId, data);
  }
}

export const messagesService = new MessagesService();
