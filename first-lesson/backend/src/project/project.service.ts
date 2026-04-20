import { Injectable, NotFoundException } from '@nestjs/common';
import { ProjectRepository, Project } from './repositories/project.repository';
import { InvariantRepository } from './repositories/invariant.repository';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

export interface ProjectResponse {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvariantResponse {
  id: string;
  content: string;
  createdAt: string;
}

@Injectable()
export class ProjectService {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly invariantRepository: InvariantRepository,
  ) {}

  async create(userId: string, dto: CreateProjectDto): Promise<ProjectResponse> {
    const project = await this.projectRepository.create(userId, dto.title, dto.description);
    return this.mapProject(project);
  }

  async findAll(userId: string, status?: string): Promise<ProjectResponse[]> {
    const projects = await this.projectRepository.findByUserId(userId, status);
    return projects.map(this.mapProject);
  }

  async findOne(userId: string, id: string): Promise<ProjectResponse> {
    const project = await this.projectRepository.findByIdAndUserId(id, userId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return this.mapProject(project);
  }

  async update(userId: string, id: string, dto: UpdateProjectDto): Promise<ProjectResponse> {
    await this.findOne(userId, id);
    const updated = await this.projectRepository.update(id, {
      title: dto.title,
      description: dto.description,
      status: dto.status,
    });
    return this.mapProject(updated);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOne(userId, id);
    await this.projectRepository.deleteById(id);
  }

  async findById(userId: string, id: string): Promise<ProjectResponse | null> {
    const project = await this.projectRepository.findByIdAndUserId(id, userId);
    return project ? this.mapProject(project) : null;
  }

  async getInvariants(userId: string, projectId: string): Promise<InvariantResponse[]> {
    await this.findOne(userId, projectId);
    const invariants = await this.invariantRepository.findByProjectId(projectId);
    return invariants.map((r) => ({
      id: r.id,
      content: r.content,
      createdAt: r.created_at,
    }));
  }

  async addInvariant(
    userId: string,
    projectId: string,
    content: string,
  ): Promise<InvariantResponse> {
    await this.findOne(userId, projectId);
    const invariant = await this.invariantRepository.create(projectId, content);
    return {
      id: invariant.id,
      content: invariant.content,
      createdAt: invariant.created_at,
    };
  }

  async removeInvariant(userId: string, projectId: string, invariantId: string): Promise<void> {
    await this.findOne(userId, projectId);
    const deleted = await this.invariantRepository.deleteByIdAndProjectId(invariantId, projectId);
    if (!deleted) {
      throw new NotFoundException('Invariant not found');
    }
  }

  async getInvariantsByProjectId(userId: string, projectId: string): Promise<string[]> {
    await this.findOne(userId, projectId);
    return this.invariantRepository.getContentByProjectId(projectId);
  }

  private mapProject(row: Project): ProjectResponse {
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      description: row.description,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
