import { Injectable, NotFoundException } from '@nestjs/common';
import { TransactionService } from '../database/transaction.service';
import { ConversationRepository, Conversation } from './repositories/conversation.repository';
import { MessageRepository } from './repositories/message.repository';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { DatabaseService } from '../database/database.service';
import { normalizeRagMode, type RagMode } from '../rag/constants';

@Injectable()
export class ConversationService {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly messageRepository: MessageRepository,
    private readonly transactionService: TransactionService,
    private readonly db: DatabaseService,
  ) {}

  async create(
    userId: string,
    projectId: string,
    dto: CreateConversationDto,
  ): Promise<Conversation> {
    return this.transactionService.run(async () => {
      const conversation = await this.conversationRepository.create({
        projectId,
        userId,
        title: dto.title,
        model: dto.model,
        systemPrompt: dto.systemPrompt,
        temperature: dto.temperature,
        maxTokens: dto.maxTokens,
        repetitionPenalty: dto.repetitionPenalty,
        contextLimit: dto.contextLimit,
        ragEnabled: dto.ragEnabled,
        ragMode: dto.ragMode ? normalizeRagMode(dto.ragMode) : undefined,
      });

      const contextId = crypto.randomUUID();
      await this.db.query(
        `INSERT INTO conversation_contexts (id, conversation_id, strategy_type)
         VALUES ($1, $2, $3)`,
        [contextId, conversation.id, dto.contextStrategy || 'sliding_window'],
      );

      return conversation;
    });
  }

  async findAll(userId: string, projectId?: string): Promise<Conversation[]> {
    if (projectId) {
      return this.conversationRepository.findByProjectId(projectId);
    }
    return this.conversationRepository.findByUserId(userId);
  }

  async findOne(userId: string, id: string): Promise<Conversation> {
    const conversation = await this.conversationRepository.findByIdAndUserId(id, userId);
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    return conversation;
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateConversationDto,
  ): Promise<Conversation> {
    await this.findOne(userId, id);

    return this.conversationRepository.update(id, {
      ...dto,
      ragMode: dto.ragMode ? normalizeRagMode(dto.ragMode) : undefined,
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOne(userId, id);
    await this.conversationRepository.deleteById(id);
  }

  async updateParams(
    id: string,
    params: Partial<{
      title: string;
      model: string;
      systemPrompt: string;
      temperature: number;
      maxTokens: number;
      repetitionPenalty: number;
      contextLimit: number;
      ragEnabled: boolean;
      ragMode: RagMode;
    }>,
  ): Promise<Conversation> {
    return this.conversationRepository.update(id, params);
  }

  async getConversationWithMessages(userId: string, id: string) {
    const conversation = await this.findOne(userId, id);
    const messages = await this.messageRepository.findByConversationId(id);
    const totals = await this.messageRepository.getTotals(id);

    return {
      ...conversation,
      messages,
      conversationTotals: totals,
    };
  }

  async getConversationTotals(conversationId: string) {
    return this.messageRepository.getTotals(conversationId);
  }
}
