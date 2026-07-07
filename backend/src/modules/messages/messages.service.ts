import { messagesRepository } from './messages.repository';
import { SendMessageDto } from './messages.dto';

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
    return messagesRepository.createMessage(institutionId, senderId, data);
  }
}

export const messagesService = new MessagesService();
