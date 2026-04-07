import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../../database/base.repository';
import { DatabaseService } from '../../database/database.service';

interface UserProfile {
  id: string;
  user_id: string;
  response_language: string;
  dialogue_style: string;
  response_brevity: string;
  custom_prompt: string;
  preferences: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class UserProfileRepository extends BaseRepository<UserProfile> {
  constructor(db: DatabaseService) {
    super(db, 'user_profiles');
  }

  async findByUserId(userId: string): Promise<UserProfile | null> {
    const result = await this.db.query<UserProfile>(
      'SELECT * FROM user_profiles WHERE user_id = $1',
      [userId],
    );
    return result.rows[0] || null;
  }

  async upsert(
    userId: string,
    data: Partial<
      Omit<UserProfile, 'id' | 'user_id' | 'created_at' | 'updated_at'>
    >,
  ): Promise<UserProfile> {
    const fields = Object.keys(data);
    const values = Object.values(data);

    const setClauses = fields
      .map((f, i) => `${f} = $${i + 2}`)
      .join(', ');
    const insertFields = ['user_id', ...fields].join(', ');
    const insertPlaceholders = Array.from(
      { length: fields.length + 1 },
      (_, i) => `$${i + 1}`,
    ).join(', ');

    const result = await this.db.query<UserProfile>(
      `INSERT INTO user_profiles (${insertFields}) VALUES (${insertPlaceholders})
       ON CONFLICT (user_id) DO UPDATE SET ${setClauses}, updated_at = NOW()
       RETURNING *`,
      [userId, ...values],
    );
    return result.rows[0];
  }
}
