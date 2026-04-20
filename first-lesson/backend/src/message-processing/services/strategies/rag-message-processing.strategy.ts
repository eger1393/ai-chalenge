import { Injectable } from '@nestjs/common';
import { RagContextResult } from '../../../rag/rag.types';
import {
  PIPELINE_SECURITY_BLOCK,
  VALIDATION_INJECTION_CHECK,
} from '../guard.service';
import { StepRunnerService, ValidationResult } from '../step-runner.service';
import {
  FinalizedValidationResult,
  MessageProcessingStrategy,
  NormalizedPlanningResult,
  StrategyExecutionMessageParams,
  StrategyExecutionStepParams,
  StrategyMessageParams,
  StrategyResolution,
  StrategyValidationMessageParams,
} from './message-processing-strategy.interface';

const RAG_STRICT_PLANNING_SYSTEM_PROMPT = `Ты — AI-планировщик в строгом RAG-режиме.

Источник фактов для ответа — только отдельное системное сообщение с RAG-доказательствами.
Твоя задача — определить, насколько RAG покрывает запрос пользователя.
Используй только chunk_id из RAG-доказательств.

Считай данные ДОСТАТОЧНЫМИ, если в чанках уже есть прямые утверждения, перечисления, ограничения, проблемы, наблюдения или выводы по теме вопроса.
Не требуй буквального совпадения формулировки вопроса с формулировкой чанка.
Если вопрос просит кратко перечислить проблемы, ограничения, мнения, что автор писал или что известно по теме, и такие сведения уже есть в чанках, нужно выбрать SUFFICIENT.
Если чанки покрывают тему только частично или не покрывают вовсе, нужно выбрать INSUFFICIENT, но ответ пользователю всё равно будет сформирован.

Ответь ТОЛЬКО валидным JSON без markdown и без пояснений:
{
  "ragVerdict": "SUFFICIENT" | "INSUFFICIENT",
  "responseMode": "ANSWER",
  "chunkIds": ["<chunk_id>", "..."],
  "missingInfo": "NONE" | "<чего не хватает>",
  "planSteps": ["<шаг 1>", "<шаг 2>", "<шаг 3>"]
}

Правила:
- не отвечай на вопрос по существу;
- не придумывай chunk_id;
- chunkIds должны содержать только chunk_id из RAG;
- при SUFFICIENT укажи все chunk_id, которые покрывают ключевые тезисы ответа;
- при INSUFFICIENT можно вернуть пустой массив или только частично полезные chunk_id;
- если ответ нужно домысливать, это INSUFFICIENT;
- если в RAG-доказательствах нет ни одного подходящего чанка, это INSUFFICIENT`;

const RAG_STRICT_EXECUTION_SYSTEM_PROMPT = `Ты — AI-исполнитель в строгом RAG-режиме.

RAG-доказательства — предпочтительный источник подтверждённых фактов.
Если RAG покрывает запрос не полностью, ты всё равно отвечаешь по существу, но обязан явно отметить, что часть ответа не подтверждена RAG.
Историю диалога, память и общие знания можно использовать только для непокрытой части ответа. Нельзя выдавать такие части за RAG-доказанные факты.

Ответь ТОЛЬКО валидным JSON без markdown и без пояснений:
{
  "mode": "ANSWER",
  "summary": "<краткий ответ по существу>",
  "ragNotice": {
    "status": "GROUNDED" | "PARTIAL" | "ABSENT",
    "message": "<краткое примечание о том, как RAG покрывает ответ>"
  },
  "references": [
    {
      "chunkId": "<uuid>",
      "quote": "<короткая дословная цитата без переноса строки>",
      "explanation": "<как это подтверждает ответ>"
    }
  ]
}

Правила:
- если релевантные chunk_id есть, используй их в references;
- references могут быть пустыми только если в плане нет релевантных chunk_id или RAG не дал пригодных доказательств;
- цитата должна быть коротким непрерывным дословным фрагментом из content соответствующего чанка;
- нельзя сокращать цитату через "..." или "…";
- нельзя склеивать в одну цитату куски из разных предложений или пропускать середину фразы;
- нельзя перефразировать цитату, даже если смысл сохраняется;
- если длинная фраза не помещается целиком, выбери более короткий точный фрагмент без переписывания;
- не используй chunk_id вне списка CHUNKS_USED;
- не добавляй в references факты, оценки или связи, которых нет в RAG;
- если часть summary основана не на RAG, обязательно отрази это в ragNotice.message;
- status=GROUNDED только когда ключевой ответ покрыт RAG;
- status=PARTIAL когда есть хотя бы одна ссылка на RAG, но полного покрытия нет;
- status=ABSENT когда в финальном ответе нет ни одной ссылки на RAG;
- не возвращай markdown, заголовки, списки и свободный текст вне JSON`;

const RAG_STRICT_VALIDATION_SYSTEM_PROMPT = `Ты — AI-валидатор в строгом RAG-режиме.

Тебе даны запрос пользователя, план и результат выполнения.
План и результат выполнения могут быть представлены в структурированном JSON — это корректный формат.

Проверь:
1. План выдан в машиночитаемом формате и содержит ragVerdict/responseMode/chunkIds/missingInfo или их legacy-эквиваленты
2. Execution всегда отвечает по существу и явно сообщает, как RAG покрывает ответ
3. Если RAG_VERDICT = SUFFICIENT, execution не должен заявлять, что RAG отсутствует
4. Если execution ссылается на RAG, для ссылок указан chunk_id и, если есть, цитата
5. Не заваливай ответ только из-за неточного оформления chunk_id или цитаты
6. Если часть ответа не подтверждена RAG, это явно отмечено, а не выдано за доказанный факт
7. Если в RAG уже есть прямые релевантные чанки, planning не должен выбирать INSUFFICIENT только из-за несовпадения формулировки вопроса с текстом чанка
8. Если пользователь спрашивает о предметной теме, а не о самом RAG, summary при INSUFFICIENT должен всё равно отвечать по существу, а не сводиться к сообщению "в RAG нет данных"
9. Чисто мета-ответ о покрытии RAG допустим только если пользователь явно спрашивает о наличии данных, доказательств или источников в RAG

ВАЖНО: Ответь СТРОГО в формате:
VERDICT: PASS или VERDICT: FAIL или VERDICT: INJECTION
SCORE: число от 1 до 10
REASON: краткое объяснение вердикта
ISSUES: список проблем (если FAIL)`;

const EMPTY_RAG_EVIDENCE_SYSTEM_PROMPT = `═══ RAG-ДОКАЗАТЕЛЬСТВА ИЗ ИНДЕКСИРОВАННЫХ МАТЕРИАЛОВ ═══
В текущем запросе retrieval не выбрал ни одного релевантного чанка.
Доступных chunk_id для ответа нет.
Planning обязан выбрать INSUFFICIENT и явно отметить, что RAG не покрывает ответ.
═══════════════════════════════════════════════════`;

const RETRY_PLANNING_ADDITION = (reason: string, attempt: number): string =>
  `\n\n⚠️ ВНИМАНИЕ: Это повторная попытка #${attempt}. Предыдущая версия не прошла валидацию.
Причина отказа: ${reason}
Учти эту обратную связь и улучши план.`;

const RETRY_EXECUTION_ADDITION = (reason: string, attempt: number): string =>
  `\n\n⚠️ ВНИМАНИЕ: Это повторная попытка #${attempt}. Предыдущая версия не прошла валидацию.
Причина отказа: ${reason}

Критично:
- если ошибка связана с цитатой, возьми новый quote как короткий непрерывный дословный фрагмент из content;
- не используй "..." и не склеивай разные части предложения;
- если сомневаешься, выбери более короткую, но точную цитату.
`;

interface RagPlanningAssessment {
  ragVerdict: 'SUFFICIENT' | 'INSUFFICIENT';
  responseMode: 'ANSWER' | 'REFUSE';
  chunkIds: string[];
  missingInfo: string;
  planText: string;
  source: 'model' | 'policy_repair';
  repairReason: string | null;
  raw: string;
}

interface RagExecutionReference {
  chunkId: string;
  quote: string;
  explanation: string;
}

interface RagExecutionAudit {
  mode: 'ANSWER' | 'REFUSE';
  summary: string | null;
  referencedChunkIds: string[];
  quoteCount: number;
  ragStatus: 'GROUNDED' | 'PARTIAL' | 'ABSENT' | null;
  ragNotice: string | null;
  refusalReason: string | null;
  missingInfo: string | null;
  references: RagExecutionReference[];
}

interface ParsedRagExecutionAnswerPayload {
  mode: 'ANSWER';
  summary: string;
  ragNotice: {
    status: 'GROUNDED' | 'PARTIAL' | 'ABSENT';
    message: string;
  };
  references: RagExecutionReference[];
}

interface ParsedRagExecutionRefusePayload {
  mode: 'REFUSE';
  reason: string;
  missingInfo: string;
}

type ParsedRagExecutionPayload = ParsedRagExecutionAnswerPayload | ParsedRagExecutionRefusePayload;

@Injectable()
export class RagMessageProcessingStrategy implements MessageProcessingStrategy {
  readonly kind = 'rag' as const;

  constructor(private readonly stepRunnerService: StepRunnerService) {}

  canParsePlanningResult(planResult: string): boolean {
    try {
      this.parseRagPlanningAssessment(planResult);
      return true;
    } catch {
      return false;
    }
  }

  buildPlanningMessages(params: StrategyMessageParams) {
    let systemPrompt = `${RAG_STRICT_PLANNING_SYSTEM_PROMPT}\n\n${PIPELINE_SECURITY_BLOCK}`;
    if (params.attempt > 1 && params.lastValidationReason) {
      systemPrompt += RETRY_PLANNING_ADDITION(params.lastValidationReason, params.attempt);
    }

    return this.stepRunnerService.buildStageMessages({
      assembledSystemPrompt: params.assembledSystemPrompt,
      historyMessages: params.contextMessages,
      userMessage: params.userContent,
      invariants: params.invariants,
      systemPrompt,
      extraSystemMessages: [
        params.resolution.ragEvidencePrompt ?? EMPTY_RAG_EVIDENCE_SYSTEM_PROMPT,
      ],
    });
  }

  normalizePlanningResult(
    rawPlanResult: string,
    resolution: StrategyResolution,
    userContent: string,
  ): NormalizedPlanningResult {
    const assessment = this.resolvePlanningAssessment(
      rawPlanResult,
      resolution.ragResult,
      userContent,
    );
    const planResult = this.serializeRagPlanningAssessment(assessment);

    return {
      planResult,
      stepOutputOverride: {
        text: planResult,
        rawText: assessment.raw,
        source: assessment.source,
        repairReason: assessment.repairReason,
      },
    };
  }

  buildExecutionMessages(params: StrategyExecutionMessageParams) {
    let systemPrompt = `${RAG_STRICT_EXECUTION_SYSTEM_PROMPT}\n\n${PIPELINE_SECURITY_BLOCK}`;
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
      extraSystemMessages: [
        params.resolution.ragEvidencePrompt ?? EMPTY_RAG_EVIDENCE_SYSTEM_PROMPT,
      ],
    });
  }

  runExecutionStep(
    stepRunnerService: StepRunnerService,
    params: StrategyExecutionStepParams,
  ) {
    return stepRunnerService.runStep(params);
  }

  buildValidationMessages(params: StrategyValidationMessageParams) {
    let systemPrompt =
      `${RAG_STRICT_VALIDATION_SYSTEM_PROMPT}\n\n${VALIDATION_INJECTION_CHECK}\n\n${PIPELINE_SECURITY_BLOCK}` +
      `\n\nПлан:\n${params.planResult}\n\nРезультат выполнения:\n${params.execResult}`;

    if (params.invariants.length > 0) {
      systemPrompt += '\n\nОБЯЗАТЕЛЬНО проверь соблюдение каждого инварианта:';
      params.invariants.forEach((invariant, index) => {
        systemPrompt += `\n${index + 1}. ${invariant} — соблюдён? (да/нет, почему)`;
      });
      systemPrompt += '\nЕсли хотя бы один инвариант нарушен — VERDICT: FAIL';
    }

    return this.stepRunnerService.buildStageMessages({
      assembledSystemPrompt: params.assembledSystemPrompt,
      historyMessages: params.contextMessages,
      userMessage: params.userContent,
      invariants: params.invariants,
      systemPrompt,
      extraSystemMessages: [
        params.resolution.ragEvidencePrompt ?? EMPTY_RAG_EVIDENCE_SYSTEM_PROMPT,
      ],
    });
  }

  finalizeValidation(params: {
    validation: ValidationResult;
    execResult: string;
    planResult: string;
    resolution: StrategyResolution;
    userContent: string;
  }): FinalizedValidationResult {
    if (!params.validation.passed) {
      return {
        validation: params.validation,
        execResult: params.execResult,
        debugPayload: null,
      };
    }

    const planning = this.parseRagPlanningAssessment(params.planResult);
    const verification = this.verifyRagExecutionOutput(
      params.execResult,
      planning,
      params.userContent,
    );

    if (!verification.ok) {
      return {
        validation: {
          ...params.validation,
          passed: false,
          reason:
            verification.reason ??
            'Execution не прошёл кодовую проверку строгого RAG-режима',
        },
        execResult: params.execResult,
        debugPayload: null,
      };
    }

    return {
      validation: params.validation,
      execResult: this.renderStrictRagResponse(
        planning,
        verification.audit,
        params.resolution.ragResult,
      ),
      debugPayload: {
        strictMode: true,
        planning: {
          ragVerdict: planning.ragVerdict,
          responseMode: planning.responseMode,
          chunkIds: planning.chunkIds,
          missingInfo: planning.missingInfo,
          planText: planning.planText,
          source: planning.source,
          repairReason: planning.repairReason,
        },
        execution: {
          mode: verification.audit.mode,
          referencedChunkIds: verification.audit.referencedChunkIds,
          quoteCount: verification.audit.quoteCount,
          ragStatus: verification.audit.ragStatus,
          ragNotice: verification.audit.ragNotice,
          refusalReason: verification.audit.refusalReason,
          missingInfo: verification.audit.missingInfo,
        },
      },
    };
  }

  private resolvePlanningAssessment(
    rawPlanResult: string,
    ragResult: RagContextResult,
    userContent: string,
  ): RagPlanningAssessment {
    try {
      const parsedAssessment = this.parseRagPlanningAssessment(rawPlanResult);
      const planningError = validateRagPlanningAssessment(
        parsedAssessment,
        ragResult,
        userContent,
      );

      if (!planningError) {
        return parsedAssessment;
      }

      const repairedAssessment = tryRepairStrictRagPlanning(
        rawPlanResult,
        planningError,
        ragResult,
        userContent,
      );

      if (!repairedAssessment) {
        throw new Error(planningError);
      }

      return repairedAssessment;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Invalid strict RAG planning output';
      const repairedAssessment = tryRepairStrictRagPlanning(
        rawPlanResult,
        errorMessage,
        ragResult,
        userContent,
      );

      if (!repairedAssessment) {
        throw error;
      }

      return repairedAssessment;
    }
  }

  private parseRagPlanningAssessment(text: string): RagPlanningAssessment {
    const safeText = text || '';
    const parsedJson = tryParseRagPlanningJson(safeText);
    if (parsedJson) {
      return parsedJson;
    }

    const rawVerdict = extractStrictPlanningField(safeText, 'RAG_VERDICT');
    const rawResponseMode = extractStrictPlanningField(safeText, 'RESPONSE_MODE');
    const rawChunksValue = extractStrictPlanningField(safeText, 'CHUNKS_USED');
    const missingInfo = extractStrictPlanningField(safeText, 'MISSING_INFO');
    const planText = extractStrictPlanningPlan(safeText);

    const verdict = rawVerdict.toUpperCase();
    const responseModeValue = rawResponseMode.toUpperCase();

    if (verdict !== 'SUFFICIENT' && verdict !== 'INSUFFICIENT') {
      throw new Error(`Planning output has invalid RAG_VERDICT: ${rawVerdict}`);
    }

    if (responseModeValue !== 'ANSWER' && responseModeValue !== 'REFUSE') {
      throw new Error(`Planning output has invalid RESPONSE_MODE: ${rawResponseMode}`);
    }

    const chunkIds =
      rawChunksValue.toUpperCase() === 'NONE'
        ? []
        : rawChunksValue
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean);
    const ragVerdict = verdict as 'SUFFICIENT' | 'INSUFFICIENT';
    const responseMode = responseModeValue as 'ANSWER' | 'REFUSE';

    if (ragVerdict === 'SUFFICIENT' && responseMode !== 'ANSWER') {
      throw new Error('Planning output has inconsistent SUFFICIENT/REFUSE combination');
    }

    if (ragVerdict === 'SUFFICIENT' && chunkIds.length === 0) {
      throw new Error('Planning output selected ANSWER without any chunk_id');
    }

    return {
      ragVerdict,
      responseMode,
      chunkIds,
      missingInfo,
      planText,
      source: 'model',
      repairReason: null,
      raw: safeText,
    };
  }

  private serializeRagPlanningAssessment(assessment: RagPlanningAssessment): string {
    return JSON.stringify(
      {
        ragVerdict: assessment.ragVerdict,
        responseMode: assessment.responseMode,
        chunkIds: assessment.chunkIds,
        missingInfo: assessment.missingInfo,
        planSteps: assessment.planText
          .split('\n')
          .map((step) => step.trim())
          .filter(Boolean),
      },
      null,
      2,
    );
  }

  private verifyRagExecutionOutput(
    execResult: string,
    planning: RagPlanningAssessment,
    userContent: string,
  ): { ok: boolean; reason?: string; audit: RagExecutionAudit } {
    const safeResult = execResult || '';
    const jsonExecution = tryParseRagExecutionJson(safeResult);
    if (jsonExecution) {
      return this.verifyStructuredRagExecution(
        jsonExecution,
        planning,
        safeResult,
        userContent,
      );
    }

    const references = parseRagExecutionReferences(safeResult);
    const summary = parseRagExecutionSummary(safeResult);
    const ragStatus = deriveRagStatus(planning, references.length);
    const audit: RagExecutionAudit = {
      mode: 'ANSWER',
      summary,
      referencedChunkIds: Array.from(new Set(references.map((reference) => reference.chunkId))),
      quoteCount: references.length,
      ragStatus,
      ragNotice: buildCanonicalRagWarning(planning, ragStatus),
      refusalReason: null,
      missingInfo: null,
      references,
    };

    if (!summary) {
      return {
        ok: false,
        reason: 'Execution не заполнил секцию "Краткий ответ" в строгом RAG-режиме',
        audit,
      };
    }

    if (references.length === 0 && planning.chunkIds.length > 0) {
      return {
        ok: false,
        reason: 'Execution не указал ни одного chunk_id с цитатой при доступных ссылках из RAG',
        audit,
      };
    }

    for (const reference of references) {
      if (!planning.chunkIds.includes(reference.chunkId)) {
        return {
          ok: false,
          reason: `Execution сослался на chunk_id вне CHUNKS_USED: ${reference.chunkId}`,
          audit,
        };
      }
      if (!reference.explanation.trim()) {
        return {
          ok: false,
          reason: `Execution вернул пустое explanation для chunk_id: ${reference.chunkId}`,
          audit,
        };
      }
    }

    const summaryValidationError = validateSubjectMatterFallback(
      summary,
      userContent,
      ragStatus,
    );
    if (summaryValidationError) {
      return {
        ok: false,
        reason: summaryValidationError,
        audit,
      };
    }

    return { ok: true, audit };
  }

  private verifyStructuredRagExecution(
    payload: ParsedRagExecutionPayload,
    planning: RagPlanningAssessment,
    rawResult: string,
    userContent: string,
  ): { ok: boolean; reason?: string; audit: RagExecutionAudit } {
    if (payload.mode === 'REFUSE') {
      const audit: RagExecutionAudit = {
        mode: 'REFUSE',
        summary: null,
        referencedChunkIds: [],
        quoteCount: 0,
        ragStatus: null,
        ragNotice: null,
        refusalReason: payload.reason,
        missingInfo: payload.missingInfo,
        references: [],
      };
      return {
        ok: false,
        reason: 'Execution вернул REFUSE, хотя strict RAG теперь должен всегда формировать ANSWER',
        audit,
      };
    }

    const references = payload.references;
    const audit: RagExecutionAudit = {
      mode: 'ANSWER',
      summary: payload.summary,
      referencedChunkIds: Array.from(new Set(references.map((reference) => reference.chunkId))),
      quoteCount: references.length,
      ragStatus: payload.ragNotice.status,
      ragNotice: payload.ragNotice.message,
      refusalReason: null,
      missingInfo: null,
      references,
    };

    if (planning.responseMode !== 'ANSWER') {
      return {
        ok: false,
        reason: 'Execution вернул ANSWER, хотя план требовал REFUSE',
        audit,
      };
    }

    if (!payload.summary.trim()) {
      return {
        ok: false,
        reason: 'Execution не заполнил summary в структурированном strict RAG-ответе',
        audit,
      };
    }

    if (references.length === 0 && planning.chunkIds.length > 0) {
      return {
        ok: false,
        reason:
          'Execution не указал ни одной ссылки на chunk_id в структурированном strict RAG-ответе при доступных источниках',
        audit,
      };
    }

    for (const reference of references) {
      if (!planning.chunkIds.includes(reference.chunkId)) {
        return {
          ok: false,
          reason: `Execution сослался на chunk_id вне CHUNKS_USED: ${reference.chunkId}`,
          audit,
        };
      }
      if (!reference.explanation.trim()) {
        return {
          ok: false,
          reason: `Execution вернул пустое explanation для chunk_id: ${reference.chunkId}`,
          audit,
        };
      }
    }

    if (rawResult.includes('## ') || rawResult.includes('chunk_id:')) {
      return {
        ok: false,
        reason: 'Execution в strict RAG должен возвращать только структурированный JSON без markdown',
        audit,
      };
    }

    const expectedStatus = deriveRagStatus(planning, references.length);
    if (payload.ragNotice.status !== expectedStatus) {
      return {
        ok: false,
        reason:
          `Execution вернул неконсистентный ragNotice.status: ожидалось ${expectedStatus}, получено ${payload.ragNotice.status}`,
        audit,
      };
    }

    if (!payload.ragNotice.message.trim()) {
      return {
        ok: false,
        reason: 'Execution не заполнил ragNotice.message в структурированном strict RAG-ответе',
        audit,
      };
    }

    const summaryValidationError = validateSubjectMatterFallback(
      payload.summary,
      userContent,
      expectedStatus,
    );
    if (summaryValidationError) {
      return {
        ok: false,
        reason: summaryValidationError,
        audit,
      };
    }

    return { ok: true, audit };
  }

  private renderStrictRagResponse(
    planning: RagPlanningAssessment,
    audit: RagExecutionAudit,
    ragResult: RagContextResult,
  ): string {
    const ragStatus = audit.ragStatus ?? 'ABSENT';
    const sections: string[] = [];

    if (ragStatus !== 'GROUNDED') {
      sections.push(
        '## Предупреждение',
        buildCanonicalRagWarning(planning, ragStatus),
        '',
      );
    }

    const matchesByChunkId = new Map(ragResult.matches.map((match) => [match.chunkId, match]));
    sections.push(
      '## Краткий ответ',
      audit.summary ?? '',
      '',
      '## Статус RAG',
      buildCanonicalRagStatusText(planning, ragStatus),
      '',
      '## Источники из RAG',
    );

    if (audit.references.length === 0) {
      sections.push('Данные в RAG отсутствуют');
    } else {
      audit.references.forEach((reference, index) => {
        const match = matchesByChunkId.get(reference.chunkId);
        const source = match
          ? String(match.document.metadata.channel_name ?? match.document.sourceKey)
          : 'unknown';
        const publishedAt = match?.document.publishedAt?.toISOString() ?? 'unknown';
        const sourceRef = match ? buildRagSourceRef(match) : 'unknown';
        const messageId = match?.document.externalId ?? 'unknown';

        sections.push(
          `${index + 1}. chunk_id: ${reference.chunkId}`,
          `   source_ref: ${sourceRef}`,
          `   source: ${source}`,
          `   message_id: ${messageId}`,
          `   published_at: ${publishedAt}`,
          `   Цитата: "${reference.quote}"`,
          `   Как это подтверждает ответ: ${reference.explanation}`,
        );
      });
    }

    return sections.join('\n');
  }
}

function validateRagPlanningAssessment(
  assessment: RagPlanningAssessment,
  ragResult: RagContextResult,
  userContent: string,
): string | null {
  const availableChunkIds = new Set(ragResult.matches.map((match) => match.chunkId));

  for (const chunkId of assessment.chunkIds) {
    if (!availableChunkIds.has(chunkId)) {
      return `Planning выбрал chunk_id вне текущего RAG-блока: ${chunkId}`;
    }
  }

  if (assessment.responseMode !== 'ANSWER') {
    return 'Planning использовал legacy RESPONSE_MODE=REFUSE, хотя strict RAG теперь должен всегда отвечать';
  }

  if (assessment.ragVerdict === 'SUFFICIENT') {
    if (assessment.missingInfo.toUpperCase() !== 'NONE') {
      return 'Planning выбрал SUFFICIENT, хотя MISSING_INFO не равно NONE';
    }
    if (assessment.chunkIds.length === 0) {
      return 'Planning выбрал SUFFICIENT без CHUNKS_USED';
    }
  }

  if (assessment.ragVerdict === 'INSUFFICIENT' && assessment.missingInfo.toUpperCase() === 'NONE') {
    return 'Planning выбрал INSUFFICIENT, но не указал чего не хватает в MISSING_INFO';
  }

  if (assessment.ragVerdict === 'INSUFFICIENT' && assessment.chunkIds.length === 0) {
    const falseInsufficientReason = detectFalseInsufficientPlanning(
      assessment,
      ragResult,
      userContent,
    );
    if (falseInsufficientReason) {
      return falseInsufficientReason;
    }
  }

  return null;
}

function detectFalseInsufficientPlanning(
  assessment: RagPlanningAssessment,
  ragResult: RagContextResult,
  userContent: string,
): string | null {
  const strongMatches = findStrongDirectEvidenceMatches(ragResult, userContent);
  if (strongMatches.length === 0) {
    return null;
  }

  const chunkIds = strongMatches
    .slice(0, 3)
    .map((match) => match.chunkId)
    .join(', ');

  return `Planning выбрал ${assessment.ragVerdict}, хотя в текущем RAG-блоке уже есть прямые релевантные чанки для ответа: ${chunkIds}`;
}

function tryRepairStrictRagPlanning(
  rawPlanResult: string,
  originalReason: string,
  ragResult: RagContextResult,
  userContent: string,
): RagPlanningAssessment | null {
  const strongMatches = findStrongDirectEvidenceMatches(ragResult, userContent);
  if (strongMatches.length > 0) {
    const repairedChunkIds = strongMatches
      .slice(0, Math.min(3, strongMatches.length))
      .map((match) => match.chunkId);

    return {
      ragVerdict: 'SUFFICIENT',
      responseMode: 'ANSWER',
      chunkIds: repairedChunkIds,
      missingInfo: 'NONE',
      planText: [
        '1. Использовать только перечисленные chunk_id как источник подтверждённых фактов по запросу пользователя.',
        '2. Сформулировать ответ по существу и опереться на RAG как на основной источник доказательств.',
        '3. Для каждого тезиса привести короткую дословную цитату и пояснение, как она подтверждает ответ.',
      ].join('\n'),
      source: 'policy_repair',
      repairReason: originalReason,
      raw: rawPlanResult,
    };
  }

  const partialChunkIds = ragResult.matches
    .slice(0, Math.min(2, ragResult.matches.length))
    .map((match) => match.chunkId);

  return {
    ragVerdict: 'INSUFFICIENT',
    responseMode: 'ANSWER',
    chunkIds: partialChunkIds,
    missingInfo:
      ragResult.matches.length > 0
        ? 'RAG покрывает запрос только частично'
        : 'В RAG нет подтверждённых данных по этому запросу',
    planText: [
      '1. Ответить по существу, но явно отметить, что RAG покрывает запрос не полностью или не покрывает вовсе.',
      '2. Если есть перечисленные chunk_id, использовать их как доступные ссылки из RAG и не приписывать им лишние факты.',
      '3. В финальном ответе явно показать статус покрытия RAG и доступные ссылки из RAG.',
    ].join('\n'),
    source: 'policy_repair',
    repairReason: originalReason,
    raw: rawPlanResult,
  };
}

function findStrongDirectEvidenceMatches(
  ragResult: RagContextResult,
  userContent: string,
): RagContextResult['matches'] {
  const effectiveQuery = (ragResult.queryRewrite.rewrittenQuery || userContent).trim();
  if (!looksLikeBroadAnswerableQuestion(effectiveQuery)) {
    return [];
  }

  return ragResult.matches.filter((match) => isStrongDirectEvidenceMatch(match, effectiveQuery));
}

function looksLikeBroadAnswerableQuestion(query: string): boolean {
  const normalized = normalizePlanningText(query);
  return /(?:^|\s)(какие|что|какой|какова|каковы|в чем|в чём|перечисли|назови|опиши|что не так|проблем|трабл|ошиб|огранич|что писал|что говорил|что знает|что думает|what|which|problems?|issues?)(?:\s|$)/iu.test(
    normalized,
  );
}

function isStrongDirectEvidenceMatch(
  match: RagContextResult['matches'][number],
  query: string,
): boolean {
  const score = match.rerankerScore ?? match.rankingScore ?? match.similarity;
  const normalizedQuery = normalizePlanningText(query);
  const normalizedContent = normalizePlanningText(match.content);
  const signalTokens = extractPlanningSignalTokens(normalizedQuery);
  const tokenHits = signalTokens.filter((token) => normalizedContent.includes(token)).length;
  const longEnough = match.content.trim().length >= 140;
  const scoreStrong = score >= 0.45 || match.similarity >= 0.5;
  const hasIssueSignal = /(?:проблем|трабл|ошиб|сбой|лимит|огранич|галлюцин|сжат|теря|потер|ослеп|слеп|утроил|расход|ложнополож|ast|tool|context|контекст)/iu.test(
    normalizedContent,
  );

  if (isProblemStyleQuestion(normalizedQuery)) {
    return longEnough && scoreStrong && tokenHits >= 1 && hasIssueSignal;
  }

  return longEnough && scoreStrong && tokenHits >= 1;
}

function isProblemStyleQuestion(query: string): boolean {
  return /(?:проблем|трабл|что не так|ошиб|сбой|лимит|огранич|issue|problem)/iu.test(query);
}

function extractPlanningSignalTokens(query: string): string[] {
  const stopwords = new Set([
    'какие',
    'какой',
    'какова',
    'каковы',
    'что',
    'где',
    'когда',
    'были',
    'было',
    'есть',
    'про',
    'это',
    'эти',
    'those',
    'what',
    'which',
    'were',
    'with',
    'about',
    'проблемы',
    'problem',
    'problems',
    'issues',
    'issue',
    'траблы',
    'ошибки',
  ]);

  return Array.from(
    new Set(
      query
        .split(/\s+/u)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3 && !stopwords.has(token)),
    ),
  );
}

function normalizePlanningText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function tryParseRagPlanningJson(text: string): RagPlanningAssessment | null {
  const parsed = tryParseJsonObject(text);
  if (!parsed) {
    return null;
  }

  const ragVerdict = readEnumField(parsed, 'ragVerdict', ['SUFFICIENT', 'INSUFFICIENT']);
  const responseMode = readEnumField(parsed, 'responseMode', ['ANSWER', 'REFUSE']);
  const chunkIds = readStringArrayField(parsed, 'chunkIds');
  const missingInfo = readStringField(parsed, 'missingInfo');
  const planSteps = readStringArrayField(parsed, 'planSteps');

  if (ragVerdict === 'SUFFICIENT' && responseMode !== 'ANSWER') {
    throw new Error('Planning output has inconsistent SUFFICIENT/REFUSE combination');
  }

  if (ragVerdict === 'SUFFICIENT' && chunkIds.length === 0) {
    throw new Error('Planning output selected ANSWER without any chunk_id');
  }

  if (planSteps.length === 0) {
    throw new Error('Planning output does not contain non-empty planSteps');
  }

  return {
    ragVerdict,
    responseMode,
    chunkIds,
    missingInfo,
    planText: planSteps.map((step, index) => `${index + 1}. ${step}`).join('\n'),
    source: 'model',
    repairReason: null,
    raw: text,
  };
}

function tryParseRagExecutionJson(text: string): ParsedRagExecutionPayload | null {
  const parsed = tryParseJsonObject(text);
  if (!parsed) {
    return null;
  }

  const mode = readEnumField(parsed, 'mode', ['ANSWER', 'REFUSE']);
  if (mode === 'REFUSE') {
    return {
      mode,
      reason: readStringField(parsed, 'reason'),
      missingInfo: readStringField(parsed, 'missingInfo'),
    };
  }

  const summary = readStringField(parsed, 'summary');
  const ragNotice = readRagNoticeField(parsed);
  const rawReferences = parsed.references;
  if (!Array.isArray(rawReferences)) {
    throw new Error('Execution output does not contain references array');
  }

  const references = rawReferences.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Execution reference at index ${index} has invalid shape`);
    }

    const record = value as Record<string, unknown>;
    return {
      chunkId: readStringField(record, 'chunkId'),
      quote: readStringField(record, 'quote'),
      explanation: readStringField(record, 'explanation'),
    };
  });

  return {
    mode,
    summary,
    ragNotice,
    references,
  };
}

function parseRagExecutionReferences(text: string): RagExecutionReference[] {
  const matches = Array.from(
    text.matchAll(
      /(?:^|\n)(?:\d+\.\s*)?chunk_id:\s*([0-9a-f-]+)\s*\n\s*Цитата:\s*"([^"\n]+)"\s*\n\s*Как это подтверждает ответ:\s*([\s\S]*?)(?=(?:\n(?:\d+\.\s*)?chunk_id:)|$)/gim,
    ),
  );

  return matches.map((match) => ({
    chunkId: match[1].trim(),
    quote: match[2].trim(),
    explanation: match[3].trim(),
  }));
}

function parseRagExecutionSummary(text: string): string | null {
  const match = text.match(
    /##\s*Краткий ответ\s*\n([\s\S]*?)(?=\n##\s*(?:Подтверждение по чанкам|Источники и цитаты|Источники из RAG)\b|$)/i,
  );
  const summary = match?.[1]?.trim() ?? '';
  return summary || null;
}

function tryParseJsonObject(text: string): Record<string, unknown> | null {
  const normalized = unwrapJsonCodeFence(text.trim());
  if (!normalized.startsWith('{')) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch (error) {
    throw new Error(
      `Structured strict RAG payload contains invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Structured strict RAG payload must be a JSON object');
  }

  return parsed as Record<string, unknown>;
}

function unwrapJsonCodeFence(value: string): string {
  if (!value.startsWith('```')) {
    return value;
  }

  return value.replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '').trim();
}

function readStringField(record: Record<string, unknown>, fieldName: string): string {
  const value = record[fieldName];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Structured strict RAG payload has invalid field "${fieldName}"`);
  }

  return value.trim();
}

function readStringArrayField(record: Record<string, unknown>, fieldName: string): string[] {
  const value = record[fieldName];
  if (!Array.isArray(value)) {
    throw new Error(`Structured strict RAG payload has invalid field "${fieldName}"`);
  }

  return value.map((item, index) => {
    if (typeof item !== 'string' || !item.trim()) {
      throw new Error(
        `Structured strict RAG payload has invalid string element in "${fieldName}" at index ${index}`,
      );
    }
    return item.trim();
  });
}

function readRagNoticeField(record: Record<string, unknown>) {
  const value = record.ragNotice;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Structured strict RAG payload has invalid field "ragNotice"');
  }

  const ragNoticeRecord = value as Record<string, unknown>;
  return {
    status: readEnumField(ragNoticeRecord, 'status', ['GROUNDED', 'PARTIAL', 'ABSENT']),
    message: readStringField(ragNoticeRecord, 'message'),
  };
}

function readEnumField<const T extends readonly string[]>(
  record: Record<string, unknown>,
  fieldName: string,
  allowedValues: T,
): T[number] {
  const rawValue = readStringField(record, fieldName).toUpperCase();
  if (!(allowedValues as readonly string[]).includes(rawValue)) {
    throw new Error(
      `Structured strict RAG payload has invalid field "${fieldName}": ${rawValue}`,
    );
  }

  return rawValue as T[number];
}

function extractStrictPlanningField(text: string, fieldName: string): string {
  const regex = new RegExp(`^${fieldName}:\\s*(.*)$`, 'gim');
  const matches = Array.from(text.matchAll(regex));

  if (matches.length === 0) {
    throw new Error(`Planning output does not contain ${fieldName}`);
  }

  if (matches.length > 1) {
    throw new Error(`Planning output contains duplicate ${fieldName}`);
  }

  const value = matches[0][1]?.trim() ?? '';
  if (!value) {
    throw new Error(`Planning output contains empty ${fieldName}`);
  }

  return value;
}

function extractStrictPlanningPlan(text: string): string {
  const regex = /^PLAN:\s*(.*)$/gim;
  const matches = Array.from(text.matchAll(regex));

  if (matches.length === 0) {
    throw new Error('Planning output does not contain PLAN');
  }

  if (matches.length > 1) {
    throw new Error('Planning output contains duplicate PLAN');
  }

  const match = matches[0];
  const sameLinePlan = match[1]?.trim() ?? '';
  const suffixStart = (match.index ?? 0) + match[0].length;
  const remainingPlan = text.slice(suffixStart).trim();
  const planText = [sameLinePlan, remainingPlan].filter(Boolean).join('\n').trim();

  if (!planText) {
    throw new Error('Planning output does not contain a non-empty PLAN section');
  }

  return planText;
}

function buildRagSourceRef(match: RagContextResult['matches'][number]): string {
  return `${match.document.sourceType}:${match.document.sourceKey}/message:${match.document.externalId}#chunk:${match.chunkIndex}`;
}

function deriveRagStatus(
  planning: RagPlanningAssessment,
  referenceCount: number,
): 'GROUNDED' | 'PARTIAL' | 'ABSENT' {
  if (planning.ragVerdict === 'SUFFICIENT') {
    return 'GROUNDED';
  }

  return referenceCount > 0 ? 'PARTIAL' : 'ABSENT';
}

function buildCanonicalRagWarning(
  planning: RagPlanningAssessment,
  ragStatus: 'GROUNDED' | 'PARTIAL' | 'ABSENT',
): string {
  switch (ragStatus) {
    case 'GROUNDED':
      return 'Ответ подтверждён данными из RAG';
    case 'PARTIAL':
      return `RAG подтверждает только часть ответа. Неподтверждённые части ниже основаны на знаниях модели${planning.missingInfo !== 'NONE' ? `; не хватает: ${planning.missingInfo}` : ''}`;
    case 'ABSENT':
    default:
      return `В RAG нет подтверждённых данных по этому вопросу. Ответ ниже основан на знаниях модели и не подтверждён RAG${planning.missingInfo !== 'NONE' ? `; не хватает: ${planning.missingInfo}` : ''}`;
  }
}

function buildCanonicalRagStatusText(
  planning: RagPlanningAssessment,
  ragStatus: 'GROUNDED' | 'PARTIAL' | 'ABSENT',
): string {
  switch (ragStatus) {
    case 'GROUNDED':
      return 'Подтверждено данными из RAG';
    case 'PARTIAL':
      return `Частичное покрытие RAG${planning.missingInfo !== 'NONE' ? `; не хватает: ${planning.missingInfo}` : ''}`;
    case 'ABSENT':
    default:
      return `RAG-данные по этому вопросу отсутствуют${planning.missingInfo !== 'NONE' ? `; не хватает: ${planning.missingInfo}` : ''}`;
  }
}

function validateSubjectMatterFallback(
  summary: string | null,
  userContent: string,
  ragStatus: 'GROUNDED' | 'PARTIAL' | 'ABSENT' | null,
): string | null {
  if (!summary || ragStatus === 'GROUNDED' || isPureRagCoverageQuestion(userContent)) {
    return null;
  }

  const sentences = extractSummarySentences(summary);
  if (sentences.length === 0) {
    return 'Execution не дал содержательного ответа по существу; summary пустой или состоит только из служебного текста';
  }

  const hasContentSentence = sentences.some((sentence) => !isMetaOnlyRagSentence(sentence));
  if (!hasContentSentence) {
    return 'Execution не дал содержательного ответа по существу; summary свёлся к сообщению об отсутствии или неполноте данных в RAG';
  }

  return null;
}

function isPureRagCoverageQuestion(userContent: string): boolean {
  const normalized = normalizeSummaryCheckText(userContent);
  const ragFocus = /(?:\brag\b|данн\w+\s+в\s+rag|источник\w*\s+из\s+rag|source_ref|chunk_id|доказательств\w*\s+из\s+rag|покрыт\w*\s+rag|релевантн\w+\s+чанк)/iu.test(
    normalized,
  );
  const subjectMatterAsk = /(?:что\s+ты\s+знаешь|что\s+знаешь|что\s+такое|расскажи|объясни|опиши|какие|какой|какова|каковы|перечисли|назови|как\s+работает|что\s+умеет|что\s+не\s+так|проблем|трабл|ошиб|огранич|what\s+do\s+you\s+know|what\s+is|tell\s+me|explain|describe)/iu.test(
    normalized,
  );

  return ragFocus && !subjectMatterAsk;
}

function extractSummarySentences(summary: string): string[] {
  return summary
    .split(/(?:[.!?]+|\n+)/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isMetaOnlyRagSentence(sentence: string): boolean {
  const normalized = normalizeSummaryCheckText(sentence);
  return /^(?:в\s+)?(?:(?:текущ\w+|сам\w+)\s+)?(?:rag(?:-доказательств\w*)?|данн\w+\s+в\s+rag|информац\w+.*\s+в\s+rag|rag\s+данные)\b.*(?:отсутств|нет|не\s+хвата|не\s+наш|не\s+найден|не\s+содерж|не\s+покрыва|частичн|релевантн\w+\s+данн\w+\s+нет)/iu.test(
    normalized,
  );
}

function normalizeSummaryCheckText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}
