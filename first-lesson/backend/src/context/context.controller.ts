import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ContextService } from './context.service';
import { UpdateContextDto } from './dto/update-context.dto';
import { SetFactDto } from './dto/set-fact.dto';
import { CreateBranchDto } from './dto/create-branch.dto';
import { CreateCheckpointDto } from './dto/create-checkpoint.dto';

@Controller('conversations/:id')
@UseGuards(JwtAuthGuard)
export class ContextController {
  constructor(private readonly contextService: ContextService) {}

  // ── Context ──

  @Get('context')
  async getContext(@Param('id') conversationId: string) {
    const ctx = await this.contextService.getContext(conversationId);
    if (!ctx) {
      throw new NotFoundException('Context not found for this conversation');
    }
    return ctx;
  }

  @Patch('context')
  async updateStrategy(
    @Param('id') conversationId: string,
    @Body() dto: UpdateContextDto,
  ) {
    if (dto.strategyType) {
      await this.contextService.updateStrategy(
        conversationId,
        dto.strategyType,
        dto.strategyData,
      );
    }
    return { success: true };
  }

  // ── Facts ──

  @Get('facts')
  async getFacts(@Param('id') conversationId: string) {
    return this.contextService.getFacts(conversationId);
  }

  @Put('facts')
  async setFact(
    @Param('id') conversationId: string,
    @Body() dto: SetFactDto,
  ) {
    await this.contextService.setFact(conversationId, dto.key, dto.value);
    return { success: true };
  }

  @Delete('facts/:key')
  async deleteFact(
    @Param('id') conversationId: string,
    @Param('key') key: string,
  ) {
    await this.contextService.deleteFact(conversationId, key);
    return { success: true };
  }

  // ── Branches ──

  @Get('branches')
  async getBranches(@Param('id') conversationId: string) {
    return this.contextService.getBranches(conversationId);
  }

  @Post('branches')
  async createBranch(
    @Param('id') conversationId: string,
    @Body() dto: CreateBranchDto,
  ) {
    return this.contextService.createBranch(
      conversationId,
      dto.name,
      dto.checkpointMessageId,
    );
  }

  @Post('branches/:bid/activate')
  async activateBranch(
    @Param('id') conversationId: string,
    @Param('bid') branchId: string,
  ) {
    await this.contextService.activateBranch(conversationId, branchId);
    return { success: true };
  }

  @Delete('branches/:bid')
  async deleteBranch(
    @Param('id') conversationId: string,
    @Param('bid') branchId: string,
  ) {
    await this.contextService.deleteBranch(conversationId, branchId);
    return { success: true };
  }

  // ── Checkpoints ──

  @Get('checkpoints')
  async getCheckpoints(@Param('id') conversationId: string) {
    return this.contextService.getCheckpoints(conversationId);
  }

  @Post('checkpoints')
  async createCheckpoint(
    @Param('id') conversationId: string,
    @Body() dto: CreateCheckpointDto,
  ) {
    return this.contextService.createCheckpoint(
      conversationId,
      dto.messageId,
      dto.label,
    );
  }
}
