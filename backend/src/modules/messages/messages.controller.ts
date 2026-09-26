import { Request, Response, NextFunction } from 'express';
import { messagesService } from './messages.service';
import { SendMessageSchema } from './messages.dto';
import { successResponse } from '../../utils/response';

export class MessagesController {
  async getInbox(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.sub;
      const institutionId = req.tenantId || req.user!.institutionId || '';
      const messages = await messagesService.getInbox(institutionId, userId);
      return successResponse(res, messages, 'Inbox retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getConversations(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.sub;
      const institutionId = req.tenantId || req.user!.institutionId || '';
      const conversations = await messagesService.getConversations(institutionId, userId);
      return successResponse(res, conversations, 'Conversations retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getConversationHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.sub;
      const institutionId = req.tenantId || req.user!.institutionId || '';
      const { userId: otherUserId } = req.params;
      const history = await messagesService.getConversationHistory(institutionId, userId, otherUserId);
      return successResponse(res, history, 'Conversation history retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async sendMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.sub;
      const institutionId = req.tenantId || req.user!.institutionId || '';
      const validatedData = SendMessageSchema.parse(req.body);
      const message = await messagesService.sendMessage(institutionId, userId, validatedData);
      return successResponse(res, message, 'Message sent successfully', 201);
    } catch (error) {
      next(error);
    }
  }
}

export const messagesController = new MessagesController();
