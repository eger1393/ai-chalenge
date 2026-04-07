import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../../database/base.repository';
import { DatabaseService } from '../../database/database.service';

export interface User {
  id: string;
  username: string;
  password_hash: string;
  role: string;
  created_at: Date;
}

@Injectable()
export class UserRepository extends BaseRepository<User> {
  constructor(db: DatabaseService) {
    super(db, 'users');
  }

  async findByUsername(username: string): Promise<User | null> {
    const result = await this.db.query<User>(
      'SELECT * FROM users WHERE username = $1',
      [username],
    );
    return result.rows[0] || null;
  }

  async create(
    username: string,
    passwordHash: string,
    role: string = 'user',
  ): Promise<User> {
    const result = await this.db.query<User>(
      `INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING *`,
      [username, passwordHash, role],
    );
    return result.rows[0];
  }

  async createIfNotExists(
    username: string,
    passwordHash: string,
    role: string = 'user',
  ): Promise<User | null> {
    const result = await this.db.query<User>(
      `INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) ON CONFLICT (username) DO NOTHING RETURNING *`,
      [username, passwordHash, role],
    );
    return result.rows[0] || null;
  }
}
