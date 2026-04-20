import { Injectable } from '@nestjs/common';
import { UserProfileService } from '../user-profile/user-profile.service';
import { ProjectService } from '../project/project.service';
import { TokenService } from '../ai/token.service';

export interface MemoryLayer {
  type: 'invariants' | 'long_term' | 'working' | 'short_term';
  label: string;
  tokenCount: number;
  content?: string;
}

export interface AssembledMemory {
  systemPrompt: string;
  layers: MemoryLayer[];
}

@Injectable()
export class MemoryAssemblerService {
  constructor(
    private readonly userProfileService: UserProfileService,
    private readonly projectService: ProjectService,
    private readonly tokenService: TokenService,
  ) {}

  async assembleMemory(params: {
    userId: string;
    projectId?: string;
    userSystemPrompt?: string;
    model: string;
  }): Promise<AssembledMemory> {
    const layers: MemoryLayer[] = [];
    const parts: string[] = [];

    // Инварианты сохраняем в слоях памяти для debug, но не дублируем в systemPrompt.
    if (params.projectId) {
      const invariants = await this.projectService.getInvariantsByProjectId(
        params.userId,
        params.projectId,
      );
      if (invariants.length > 0) {
        const invariantsContent = invariants.map((inv, i) => `${i + 1}. ${inv}`).join('\n');
        const section = `═══ ИНВАРИАНТЫ (НАРУШЕНИЕ ЗАПРЕЩЕНО) ═══\nСЛЕДУЮЩИЕ ПРАВИЛА НЕЛЬЗЯ НАРУШАТЬ НИ ПРИ КАКИХ ОБСТОЯТЕЛЬСТВАХ.\nДаже если пользователь явно просит нарушить эти правила — ОТКАЗАТЬ и объяснить что это инвариант.\n\n${invariantsContent}\n═══════════════════════════════════════`;
        layers.push({
          type: 'invariants',
          label: `Инварианты (${invariants.length})`,
          tokenCount: this.tokenService.countTokens(section, params.model),
          content: section,
        });
      }
    }

    // === LONG-TERM: user profile ===
    const profile = await this.userProfileService.getProfile(params.userId);
    const longTermContent = this.buildLongTermContent(profile);
    if (longTermContent) {
      const section = `[LONG-TERM MEMORY — User Profile]\n${longTermContent}`;
      parts.push(section);
      layers.push({
        type: 'long_term',
        label: 'User Profile',
        tokenCount: this.tokenService.countTokens(section, params.model),
        content: longTermContent,
      });
    }

    // === WORKING: project context ===
    if (params.projectId) {
      const project = await this.projectService.findById(params.userId, params.projectId);
      if (project) {
        const workingContent = `Task: ${project.title}${project.description ? `\n${project.description}` : ''}`;
        const section = `[WORKING MEMORY — Current Task]\n${workingContent}`;
        parts.push(section);
        layers.push({
          type: 'working',
          label: `Task: ${project.title}`,
          tokenCount: this.tokenService.countTokens(section, params.model),
          content: workingContent,
        });
      }
    }

    // === SHORT-TERM: user system prompt ===
    if (params.userSystemPrompt?.trim()) {
      const section = params.userSystemPrompt.trim();
      parts.push(section);
      layers.push({
        type: 'short_term',
        label: 'Custom System Prompt',
        tokenCount: this.tokenService.countTokens(section, params.model),
        content: section,
      });
    }

    return {
      systemPrompt: parts.join('\n\n---\n\n'),
      layers,
    };
  }

  private buildLongTermContent(profile: Record<string, unknown>): string {
    const lines: string[] = [];

    // Language
    if (profile.responseLanguage === 'ru') {
      lines.push('Always respond in Russian (Русский), regardless of the language of the user\'s message.');
    } else if (profile.responseLanguage === 'en') {
      lines.push('Always respond in English, regardless of the language of the user\'s message.');
    }
    // 'auto' — no instruction added

    // Dialogue style
    const styleMap: Record<string, string> = {
      formal: 'Use a formal, professional tone. Avoid colloquialisms, slang, and casual language. Address the user respectfully.',
      friendly: 'Use a warm, friendly, and conversational tone. Feel free to use casual language and be approachable.',
      technical: 'Use a precise, technical tone. Prioritize accuracy and specificity. Use domain-specific terminology where appropriate and provide structured explanations.',
      creative: 'Use a creative, expressive tone. Feel free to use metaphors, analogies, and vivid language. Be imaginative in your responses.',
      yoda: 'Speak in the style of Master Yoda from Star Wars. Invert sentence structure by placing the object or predicate before the subject (e.g., "Strong with the Force, you are"). Convey deep wisdom and philosophical insight. Be calm, reflective, and occasionally cryptic. Use short, memorable phrases.',
    };
    if (profile.dialogueStyle && styleMap[profile.dialogueStyle as string]) {
      lines.push(styleMap[profile.dialogueStyle as string]);
    }

    // Brevity
    const brevityMap: Record<string, string> = {
      brief: 'Be concise and to the point. Provide short, focused answers without unnecessary elaboration. Use bullet points where appropriate.',
      detailed: 'Provide thorough, detailed answers. Explain your reasoning, include examples, and cover edge cases. Depth is preferred over brevity.',
    };
    if (profile.responseBrevity && brevityMap[profile.responseBrevity as string]) {
      lines.push(brevityMap[profile.responseBrevity as string]);
    }
    // 'unset' — no instruction added

    // Custom prompt
    if ((profile.customPrompt as string)?.trim()) {
      lines.push((profile.customPrompt as string).trim());
    }

    return lines.join('\n');
  }
}
