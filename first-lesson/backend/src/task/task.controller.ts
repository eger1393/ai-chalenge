import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TaskService } from './task.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Post()
  create(@Request() req, @Body() dto: CreateTaskDto) {
    return this.taskService.create(req.user.username, dto);
  }

  @Get()
  findAll(@Request() req, @Query('status') status?: string) {
    return this.taskService.findAll(req.user.username, status);
  }

  @Get(':id')
  findOne(@Request() req, @Param('id') id: string) {
    return this.taskService.findOne(req.user.username, id);
  }

  @Patch(':id')
  update(@Request() req, @Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.taskService.update(req.user.username, id, dto);
  }

  @Delete(':id')
  remove(@Request() req, @Param('id') id: string) {
    return this.taskService.remove(req.user.username, id);
  }

  @Get(':id/conversations')
  getConversations(@Request() req, @Param('id') id: string) {
    return this.taskService.getConversations(req.user.username, id);
  }

  @Get(':id/invariants')
  getInvariants(@Request() req, @Param('id') id: string) {
    return this.taskService.getInvariants(id);
  }

  @Post(':id/invariants')
  addInvariant(@Request() req, @Param('id') id: string, @Body() body: { content: string }) {
    return this.taskService.addInvariant(id, body.content);
  }

  @Delete(':id/invariants/:invariantId')
  removeInvariant(@Param('id') id: string, @Param('invariantId') invariantId: string) {
    return this.taskService.removeInvariant(id, invariantId);
  }

  @Get(':id/conversation-count')
  getConversationCount(@Param('id') id: string) {
    return this.taskService.getConversationCount(id);
  }
}
