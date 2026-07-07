import { z } from 'zod';

export const SendMessageSchema = z.object({
  receiverId: z.string().min(1, 'Receiver is required'),
  content: z.string().min(1, 'Content is required'),
});

export type SendMessageDto = z.infer<typeof SendMessageSchema>;
