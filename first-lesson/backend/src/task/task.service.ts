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
    // Cascade: delete conversations linked to this task (messages, debug_data etc. cascade from there)
    await this.db.query(`DELETE FROM conversations WHERE task_id = $1`, [id]);
    await this.db.query(`DELETE FROM tasks WHERE id = $1 AND username = $2`, [id, username]);
  }

  async getConversationCount(taskId: string): Promise<number> {
    const result = await this.db.query(
      `SELECT COUNT(*)::int AS count FROM conversations WHERE task_id = $1`,
      [taskId],
    );
    return result.rows[0]?.count ?? 0;
  }

  async getInvariants(taskId: string): Promise<Array<{ id: string; content: string; createdAt: string }>> {
    const result = await this.db.query(
      `SELECT id, content, created_at FROM task_invariants WHERE task_id = $1 ORDER BY created_at ASC`,
      [taskId],
    );
    return result.rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      content: r.content as string,
      createdAt: r.created_at as string,
    }));
  }

  async addInvariant(taskId: string, content: string): Promise<{ id: string; content: string; createdAt: string }> {
    const result = await this.db.query(
      `INSERT INTO task_invariants (task_id, content) VALUES ($1, $2) RETURNING id, content, created_at`,
      [taskId, content],
    );
    const r = result.rows[0];
    return { id: r.id, content: r.content, createdAt: r.created_at };
  }

  async removeInvariant(taskId: string, invariantId: string): Promise<void> {
    await this.db.query(
      `DELETE FROM task_invariants WHERE id = $1 AND task_id = $2`,
      [invariantId, taskId],
    );
  }

  async getInvariantsByTaskId(taskId: string): Promise<string[]> {
    const result = await this.db.query(
      `SELECT content FROM task_invariants WHERE task_id = $1 ORDER BY created_at ASC`,
      [taskId],
    );
    return result.rows.map((r: Record<string, unknown>) => r.content as string);
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
