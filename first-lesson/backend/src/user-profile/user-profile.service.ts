import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

const DEFAULT_PROFILE = {
  responseLanguage: 'auto' as const,
  dialogueStyle: 'friendly' as const,
  responseBrevity: 'unset' as const,
  customPrompt: '',
  preferences: {},
};

@Injectable()
export class UserProfileService {
  constructor(private readonly db: DatabaseService) {}

  async getProfile(username: string) {
    const result = await this.db.query(
      `SELECT * FROM user_profiles WHERE username = $1`,
      [username],
    );
    if (!result.rows[0]) return { ...DEFAULT_PROFILE };
    return this.mapProfile(result.rows[0]);
  }

  async upsertProfile(username: string, dto: UpdateProfileDto) {
    const result = await this.db.query(
      `INSERT INTO user_profiles (username, response_language, dialogue_style, response_brevity, custom_prompt)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (username) DO UPDATE SET
         response_language = $2,
         dialogue_style = $3,
         response_brevity = $4,
         custom_prompt = $5,
         updated_at = NOW()
       RETURNING *`,
      [
        username,
        dto.responseLanguage ?? 'auto',
        dto.dialogueStyle ?? 'friendly',
        dto.responseBrevity ?? 'unset',
        dto.customPrompt ?? '',
      ],
    );
    return this.mapProfile(result.rows[0]);
  }

  private mapProfile(row: Record<string, unknown>) {
    return {
      responseLanguage: row.response_language,
      dialogueStyle: row.dialogue_style,
      responseBrevity: row.response_brevity,
      customPrompt: row.custom_prompt,
      preferences: (row.preferences as Record<string, unknown>) ?? {},
    };
  }
}
