import { Injectable } from '@nestjs/common';
import { UserProfileRepository } from './repositories/user-profile.repository';
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
  constructor(
    private readonly userProfileRepository: UserProfileRepository,
  ) {}

  async getProfile(userId: string) {
    const row = await this.userProfileRepository.findByUserId(userId);
    if (!row) return { ...DEFAULT_PROFILE };
    return this.mapProfile(row);
  }

  async upsertProfile(userId: string, dto: UpdateProfileDto) {
    const row = await this.userProfileRepository.upsert(userId, {
      response_language: dto.responseLanguage ?? 'auto',
      dialogue_style: dto.dialogueStyle ?? 'friendly',
      response_brevity: dto.responseBrevity ?? 'unset',
      custom_prompt: dto.customPrompt ?? '',
    });
    return this.mapProfile(row);
  }

  private mapProfile(row: {
    response_language: string;
    dialogue_style: string;
    response_brevity: string;
    custom_prompt: string;
    preferences?: Record<string, any>;
  }) {
    return {
      responseLanguage: row.response_language,
      dialogueStyle: row.dialogue_style,
      responseBrevity: row.response_brevity,
      customPrompt: row.custom_prompt,
      preferences: row.preferences ?? {},
    };
  }
}
