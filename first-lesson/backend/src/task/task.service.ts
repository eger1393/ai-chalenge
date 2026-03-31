import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TaskService {
  constructor(private readonly db: DatabaseService) {}

  async create(username: string, dto: CreateTaskDto) {
    const result = await this.db.query(
      `INSERT INTO tasks (username, title, description) VALUES ($1, $2, $3) RETURNING *`,
      [username, dto.title, dto.description ?? null],
    );
    return this.mapTask(result.rows[0]);
  }

  async findAll(username: string, status?: string) {
    const statusFilter = status || 'active';
    const result = await this.db.query(
      `SELECT * FROM tasks WHERE username = $1 AND status = $2 ORDER BY created_at DESC`,
      [username, statusFilter],
    );
    return result.rows.map(this.mapTask);
  }

  async findOne(username: string, id: string) {
    const result = await this.db.query(
      `SELECT * FROM tasks WHERE id = $1 AND username = $2`,
      [id, username],
    );
    if (!result.rows[0]) throw new NotFoundException('Task not found');
    return this.mapTask(result.rows[0]);
  }

  async update(username: string, id: string, dto: UpdateTaskDto) {
    await this.findOne(username, id);
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    if (dto.title !== undefined) { sets.push(`title = $${idx++}`); values.push(dto.title); }
    if (dto.description !== undefined) { sets.push(`description = $${idx++}`); values.push(dto.description); }
    if (dto.status !== undefined) { sets.push(`status = $${idx++}`); values.push(dto.status); }
    if (sets.length === 0) return this.findOne(username, id);
    sets.push(`updated_at = NOW()`);
    values.push(id, username);
    const result = await this.db.query(
      `UPDATE tasks SET ${sets.join(', ')} WHERE id = $${idx++} AND username = $${idx} RETURNING *`,
      values,
    );
    return this.mapTask(result.rows[0]);
  }

  async remove(username: string, id: string) {
    await this.findOne(username, id);
    await this.db.query(`DELETE FROM tasks WHERE id = $1 AND username = $2`, [id, username]);
  }

  async getConversations(username: string, taskId: string) {
    await this.findOne(username, taskId);
    const result = await this.db.query(
      `SELECT id, title, model, created_at AS "createdAt", updated_at AS "updatedAt", task_id AS "taskId"
       FROM conversations WHERE task_id = $1 AND username = $2 ORDER BY created_at DESC`,
      [taskId, username],
    );
    return result.rows;
  }

  // Used internally by MemoryAssemblerService
  async findById(id: string) {
    const result = await this.db.query(`SELECT * FROM tasks WHERE id = $1`, [id]);
    return result.rows[0] ? this.mapTask(result.rows[0]) : null;
  }

  private mapTask(row: Record<string, unknown>) {
    return {
      id: row.id,
      username: row.username,
      title: row.title,
      description: row.description,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
