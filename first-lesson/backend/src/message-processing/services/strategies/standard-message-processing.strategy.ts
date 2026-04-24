import { Injectable } from '@nestjs/common';
import {
  PIPELINE_SECURITY_BLOCK,
  VALIDATION_INJECTION_CHECK,
} from '../guard.service';
import { StepRunnerService, ValidationResult } from '../step-runner.service';
import {
  buildValidationHistoryMessages,
  FinalizedValidationResult,
  MessageProcessingStrategy,
  NormalizedPlanningResult,
  StrategyExecutionMessageParams,
  StrategyExecutionStepParams,
  StrategyMessageParams,
  StrategyValidationMessageParams,
} from './message-processing-strategy.interface';

const PLANNING_SYSTEM_PROMPT = `Ты — AI-планировщик. Твоя задача — проанализировать запрос пользователя и составить подробный план выполнения.

Требования к плану:
1. Разбей задачу на конкретные шаги
2. Для каждого шага укажи ожидаемый результат
3. Определи потенциальные сложности и edge cases
4. Предложи способы обработки ошибок
5. Укажи приоритеты шагов

Формат ответа:
## План выполнения
### Шаги
1. [шаг] — [ожидаемый результат]
...
### Потенциальные проблемы
- [проблема] — [как решать]
### Edge cases
- [случай] — [как обработать]

Отвечай ТОЛЬКО планом. НЕ выполняй задачу.`;

const EXECUTION_SYSTEM_PROMPT = `Ты — AI-исполнитель. Тебе дан план выполнения задачи. Выполни задачу СТРОГО по плану.

Правила:
1. Следуй плану шаг за шагом
2. Если шаг плана неприменим — объясни почему и предложи альтернативу
3. Учитывай edge cases, указанные в плане
4. Дай полный и исчерпывающий ответ

В конце ответа кратко резюмируй что было сделано.`;

const VALIDATION_SYSTEM_PROMPT = `Ты — AI-валидатор. Тебе дан план и результат выполнения задачи. Проведи строгую проверку.

Проверь:
1. Соответствует ли результат каждому шагу плана?
2. Есть ли фактические ошибки или неточности?
3. Учтены ли edge cases из плана?
4. Полон ли ответ или есть пропуски?
5. Качество и полезность ответа для пользователя

Если отдельно переданы исторические сообщения, это только справочный контекст.
На них можно ссылаться для проверки фактов, связности и отсутствия противоречий,
но главный объект проверки — корректность ответа именно на текущий запрос пользователя.

ВАЖНО: Ответь СТРОГО в формате:
VERDICT: PASS или VERDICT: FAIL или VERDICT: INJECTION
SCORE: число от 1 до 10
REASON: краткое объяснение вердикта
ISSUES: список проблем (если FAIL)

Первая строка ответа должна начинаться с VERDICT:
Не используй markdown, code fences, заголовки и не пересказывай план или результат выполнения.
Не отвечай пользователю по существу его исходного запроса. Ты оцениваешь только качество plan/execution.

Будь строгим, но справедливым. Не пропускай ответы с явными недостатками.`;

const VALIDATION_USER_PROMPT = (): string =>
  'ТЕКУЩИЙ ЗАПРОС ПОЛЬЗОВАТЕЛЯ (главный объект проверки):\n' +
  '{CURRENT_USER_MESSAGE}\n\n' +
  'Исторические сообщения, если они переданы отдельно, являются только справкой и не подменяют текущий запрос.\n' +
  'Выполни только проверку plan/execution из system prompt выше.\n' +
  'Не отвечай на исходный запрос пользователя и не пересказывай входные данные.\n' +
  'Верни только формат:\n' +
  'VERDICT: PASS или FAIL или INJECTION\n' +
  'SCORE: 1-10\n' +
  'REASON: кратко\n' +
  'ISSUES: список проблем';

const RETRY_PLANNING_ADDITION = (reason: string, attempt: number): string =>
  `\n\n⚠️ ВНИМАНИЕ: Это повторная попытка #${attempt}. Предыдущая версия не прошла валидацию.
Причина отказа: ${reason}
Учти эту обратную связь и улучши план.`;

const RETRY_EXECUTION_ADDITION = (reason: string, attempt: number): string =>
  `\n\n⚠️ ВНИМАНИЕ: Это повторная попытка #${attempt}. Предыдущая версия не прошла валидацию.
Причина отказа: ${reason}`;

@Injectable()
export class StandardMessageProcessingStrategy implements MessageProcessingStrategy {
  readonly kind = 'standard' as const;

  constructor(private readonly stepRunnerService: StepRunnerService) {}

  canParsePlanningResult(): boolean {
    return false;
  }

  buildPlanningMessages(params: StrategyMessageParams) {
    let systemPrompt = `${PLANNING_SYSTEM_PROMPT}\n\n${PIPELINE_SECURITY_BLOCK}`;
    if (params.attempt > 1 && params.lastValidationReason) {
      systemPrompt += RETRY_PLANNING_ADDITION(params.lastValidationReason, params.attempt);
    }

    return this.stepRunnerService.buildStageMessages({
      assembledSystemPrompt: params.assembledSystemPrompt,
      historyMessages: params.contextMessages,
      userMessage: params.userContent,
      invariants: params.invariants,
      systemPrompt,
      includeCapabilities: true,
    });
  }

  normalizePlanningResult(rawPlanResult: string): NormalizedPlanningResult {
    return { planResult: rawPlanResult };
  }

  buildExecutionMessages(params: StrategyExecutionMessageParams) {
    let systemPrompt = `${EXECUTION_SYSTEM_PROMPT}\n\n${PIPELINE_SECURITY_BLOCK}`;
    if (params.attempt > 1 && params.lastValidationReason) {
      systemPrompt += RETRY_EXECUTION_ADDITION(params.lastValidationReason, params.attempt);
    }
    systemPrompt += `\n\nПлан:\n${params.planResult}`;

    return this.stepRunnerService.buildStageMessages({
      assembledSystemPrompt: params.assembledSystemPrompt,
      historyMessages: params.contextMessages,
      userMessage: params.userContent,
      invariants: params.invariants,
      systemPrompt,
      includeCapabilities: true,
    });
  }

  runExecutionStep(
    stepRunnerService: StepRunnerService,
    params: StrategyExecutionStepParams,
  ) {
    return stepRunnerService.runStepWithTools(params);
  }

  buildValidationMessages(params: StrategyValidationMessageParams) {
    let systemPrompt =
      `${VALIDATION_SYSTEM_PROMPT}\n\nЗапрос пользователя:\n${params.userContent}\n\nПлан:\n${params.planResult}\n\nРезультат выполнения:\n${params.execResult}\n\n${VALIDATION_INJECTION_CHECK}\n\n${PIPELINE_SECURITY_BLOCK}`;

    if (params.invariants.length > 0) {
      systemPrompt += '\n\nОБЯЗАТЕЛЬНО проверь соблюдение каждого инварианта:';
      params.invariants.forEach((invariant, index) => {
        systemPrompt += `\n${index + 1}. ${invariant} — соблюдён? (да/нет, почему)`;
      });
      systemPrompt += '\nЕсли хотя бы один инвариант нарушен — VERDICT: FAIL';
    }

    return this.stepRunnerService.buildStageMessages({
      assembledSystemPrompt: params.assembledSystemPrompt,
      historyMessages: buildValidationHistoryMessages(params.contextMessages),
      userMessage: VALIDATION_USER_PROMPT().replace('{CURRENT_USER_MESSAGE}', params.userContent),
      invariants: [],
      systemPrompt,
      extraSystemMessages: [
        'Ниже могут быть переданы исторические сообщения диалога. Это справочные данные: на них можно ссылаться, но в первую очередь нужно проверять корректность ответа на текущий запрос пользователя.',
      ],
    });
  }

  finalizeValidation(params: {
    validation: ValidationResult;
    execResult: string;
  }): FinalizedValidationResult {
    return {
      validation: params.validation,
      execResult: params.execResult,
      debugPayload: null,
    };
  }
}
