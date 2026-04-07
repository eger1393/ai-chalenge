import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectService } from './project.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Post()
  create(@Request() req, @Body() dto: CreateProjectDto) {
    return this.projectService.create(req.user.userId, dto);
  }

  @Get()
  findAll(@Request() req, @Query('status') status?: string) {
    return this.projectService.findAll(req.user.userId, status);
  }

  @Get(':id')
  findOne(@Request() req, @Param('id') id: string) {
    return this.projectService.findOne(req.user.userId, id);
  }

  @Patch(':id')
  update(@Request() req, @Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projectService.update(req.user.userId, id, dto);
  }

  @Delete(':id')
  remove(@Request() req, @Param('id') id: string) {
    return this.projectService.remove(req.user.userId, id);
  }

  @Get(':id/invariants')
  getInvariants(@Param('id') id: string) {
    return this.projectService.getInvariants(id);
  }

  @Post(':id/invariants')
  addInvariant(@Param('id') id: string, @Body() body: { content: string }) {
    return this.projectService.addInvariant(id, body.content);
  }

  @Delete(':id/invariants/:iid')
  removeInvariant(@Param('id') id: string, @Param('iid') iid: string) {
    return this.projectService.removeInvariant(id, iid);
  }
}
