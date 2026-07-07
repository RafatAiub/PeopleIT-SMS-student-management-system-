import { Request, Response } from 'express';
import { messagesService } from './messages.service';
import { SendMessageSchema } from './messages.dto';

export class MessagesController {
  async getInbox(req: Request, res: Response) {
    try {
      const userId = req.user!.sub;
      const institutionId = req.user!.institutionId || '';
      const messages = await messagesService.getInbox(institutionId, userId);
      res.json({ success: true, data: messages });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  async getConversations(req: Request, res: Response) {
    try {
      const userId = req.user!.sub;
      const institutionId = req.user!.institutionId || '';
      const conversations = await messagesService.getConversations(institutionId, userId);
      res.json({ success: true, data: conversations });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  async getConversationHistory(req: Request, res: Response) {
    try {
      const userId = req.user!.sub;
      const institutionId = req.user!.institutionId || '';
      const { userId: otherUserId } = req.params;
      const history = await messagesService.getConversationHistory(institutionId, userId, otherUserId);
      res.json({ success: true, data: history });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  async sendMessage(req: Request, res: Response) {
    try {
      const userId = req.user!.sub;
      const institutionId = req.user!.institutionId || '';
      const validatedData = SendMessageSchema.parse(req.body);
      const message = await messagesService.sendMessage(institutionId, userId, validatedData);
      res.status(201).json({ success: true, data: message });
    } catch (error: any) {
      if (error.name === 'ZodError') {
         return res.status(400).json({ success: false, errors: error.errors });
      }
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

export const messagesController = new MessagesController();
