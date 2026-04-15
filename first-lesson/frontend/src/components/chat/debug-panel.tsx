'use client';

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Clock, Coins, Hash, Cpu, CheckCircle2, XCircle, FileText, MessageSquare, ArrowRight, Copy, Check, Wrench, Database, Search } from 'lucide-react';
import { MessageDebugData } from '@/types/conversation';

interface DebugPanelProps {
  debugData: MessageDebugData;
  isLoading?: boolean;
}

const STEP_LABELS: Record<string, string> = {
  planning: 'Планирование',
  execution: 'Выполнение',
  validation: 'Валидация',
};

const STEP_COLORS: Record<string, { bg: string; text: string; border: string; icon: string; headerBg: string; dot: string }> = {
  planning: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: 'text-amber-500', headerBg: 'bg-amber-100/60', dot: 'border-amber-400 bg-amber-100' },
  execution: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', icon: 'text-indigo-500', headerBg: 'bg-indigo-100/60', dot: 'border-indigo-400 bg-indigo-100' },
  validation: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200', icon: 'text-violet-500', headerBg: 'bg-violet-100/60', dot: 'border-violet-400 bg-violet-100' },
};

const STRATEGY_LABELS: Record<string, string> = {
  sliding_window: 'Скользящее окно',
  sticky_facts: 'Факты',
  branching: 'Ветки',
  pipeline: 'Pipeline',
};

const LAYER_CONFIG = {
  long_term: { label: 'Долговременная', emoji: '\u{1F9E0}', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  working: { label: 'Рабочая', emoji: '\u{1F4CB}', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  short_term: { label: 'Краткосрочная', emoji: '\u{1F4AC}', bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200' },
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function formatCost(n: number): string {
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function formatPercent(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function formatDate(value?: string | null): string {
  if (!value) return 'без даты';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── Copy Button ──────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="p-0.5 rounded text-gray-400 hover:text-gray-600 transition-colors"
      title="Копировать"
    >
      {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

// ── Stat Pill ─────────────────────────────────────────────────────────

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 rounded-md">
      {icon}
      <span className="text-[10px] text-gray-500">{label}</span>
      <span className="text-[11px] font-mono font-medium text-gray-700">{value}</span>
    </div>
  );
}

// ── Pipeline Step Card ────────────────────────────────────────────────

function PipelineStepCard({ step, index, isExpanded, onToggle }: {
  step: NonNullable<MessageDebugData['pipelineData']>['steps'][number];
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const [showInput, setShowInput] = useState(false);
  const [showToolCalls, setShowToolCalls] = useState(false);
  const [expandedToolResults, setExpandedToolResults] = useState<Set<number>>(new Set());
  const [showOutput, setShowOutput] = useState(false);
  const colors = STEP_COLORS[step.stepType] || STEP_COLORS.planning;
  const isValidation = step.stepType === 'validation';
  const totalTokens = step.promptTokens + step.completionTokens;
  const inputMessages = step.inputContext || [];
  const toolCalls = step.toolCalls || [];

  const toggleToolResult = (i: number) => {
    setExpandedToolResults(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
  };

  const getToolDisplayName = (name: string) => {
    const parts = name.split('__');
    return parts.length > 1 ? parts.slice(1).join('__') : name;
  };

  const getToolServer = (tc: NonNullable<typeof step.toolCalls>[number]) => {
    return tc.displayName || tc.server || tc.name.split('__')[0] || '';
  };

  const formatToolArgs = (args: string): string => {
    try {
      return JSON.stringify(JSON.parse(args), null, 2);
    } catch {
      return args;
    }
  };

  return (
    <div className={`rounded-lg border ${colors.border} overflow-hidden`}>
      {/* Step header -- always visible */}
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left ${colors.headerBg} hover:opacity-90 transition-opacity`}
      >
        {isValidation ? (
          step.validationPassed
            ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
            : <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
        ) : (
          <FileText className={`w-4 h-4 ${colors.icon} flex-shrink-0`} />
        )}

        <span className={`text-xs font-semibold ${colors.text} flex-1`}>
          {STEP_LABELS[step.stepType] || step.stepType}
          {step.attempt > 1 && (
            <span className="ml-1.5 text-[10px] font-normal opacity-70">#{step.attempt}</span>
          )}
        </span>

        {/* Compact meta */}
        <span className={`text-[10px] font-mono ${colors.text} opacity-60`}>{step.model}</span>
        <span className={`text-[10px] font-mono ${colors.text} opacity-60`}>{formatTokens(totalTokens)}</span>
        <span className={`text-[10px] font-mono ${colors.text} opacity-60`}>{formatCost(step.cost)}</span>
        <span className={`text-[10px] font-mono ${colors.text} opacity-60 flex items-center gap-0.5`}>
          <Clock className="w-2.5 h-2.5" />
          {formatDuration(step.durationMs)}
        </span>

        {isExpanded
          ? <ChevronDown className={`w-4 h-4 ${colors.icon} flex-shrink-0`} />
          : <ChevronRight className={`w-4 h-4 ${colors.icon} flex-shrink-0`} />
        }
      </button>

      {/* Expanded details */}
      {isExpanded && (
        <div className="bg-white">
          {/* Token & meta row */}
          <div className="flex flex-wrap gap-3 px-3 py-2 text-[10px] text-gray-500 font-mono border-t border-gray-100">
            <span>prompt: <span className="text-gray-700">{step.promptTokens.toLocaleString()}</span></span>
            <span>completion: <span className="text-gray-700">{step.completionTokens.toLocaleString()}</span></span>
            {inputMessages.length > 0 && (
              <span>input messages: <span className="text-gray-700">{inputMessages.length}</span></span>
            )}
          </div>

          {/* Validation reason */}
          {step.validationReason && (
            <div className="px-3 pb-2">
              <div className={`text-xs rounded-md px-2.5 py-1.5 ${
                step.validationPassed
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                <span className="font-medium">{step.validationPassed ? 'Результат:' : 'Причина отказа:'}</span>{' '}
                {step.validationReason}
              </div>
            </div>
          )}

          {/* Input Context -- collapsible */}
          {inputMessages.length > 0 && (
            <div className="border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowInput(v => !v)}
                className="w-full flex items-center gap-1.5 px-3 py-1.5 text-left hover:bg-gray-50 transition-colors"
              >
                <ArrowRight className="w-3 h-3 text-gray-400" />
                <span className="text-[11px] font-medium text-gray-500">Входные данные</span>
                <span className="text-[10px] text-gray-400 font-mono">{inputMessages.length} сообщ.</span>
                <span className="flex-1" />
                <CopyButton text={inputMessages.map(m => `[${m.role}]\n${m.content}`).join('\n\n')} />
                {showInput
                  ? <ChevronDown className="w-3 h-3 text-gray-400" />
                  : <ChevronRight className="w-3 h-3 text-gray-400" />
                }
              </button>
              {showInput && (
                <div className="px-3 pb-2 space-y-1 max-h-60 overflow-y-auto">
                  {inputMessages.map((msg, mi) => (
                    <div key={mi} className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <MessageSquare className="w-3 h-3 text-gray-400" />
                        <span className={`text-[10px] font-semibold ${
                          msg.role === 'system' ? 'text-purple-600' :
                          msg.role === 'user' ? 'text-indigo-600' : 'text-green-600'
                        }`}>{msg.role}</span>
                        <span className="text-[10px] text-gray-400 font-mono">{msg.content.length} chars</span>
                      </div>
                      <div className="text-[11px] text-gray-600 whitespace-pre-wrap break-words font-mono max-h-32 overflow-y-auto leading-relaxed">
                        {msg.content}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tool Calls -- collapsible */}
          {toolCalls.length > 0 && (
            <div className="border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowToolCalls(v => !v)}
                className="w-full flex items-center gap-1.5 px-3 py-1.5 text-left hover:bg-teal-50/50 transition-colors"
              >
                <Wrench className="w-3 h-3 text-teal-500" />
                <span className="text-[11px] font-medium text-teal-600">Tool Calls</span>
                <span className="text-[10px] text-teal-400 font-mono">{toolCalls.length} вызов{toolCalls.length > 1 ? 'ов' : ''}</span>
                <span className="flex-1" />
                {showToolCalls
                  ? <ChevronDown className="w-3 h-3 text-teal-400" />
                  : <ChevronRight className="w-3 h-3 text-teal-400" />
                }
              </button>
              {showToolCalls && (
                <div className="px-3 pb-2 space-y-1.5 max-h-80 overflow-y-auto">
                  {toolCalls.map((tc, ti) => {
                    const displayName = getToolDisplayName(tc.name);
                    const serverLabel = getToolServer(tc);
                    const isResultLong = tc.result && tc.result.length > 200;
                    const isResultExpanded = expandedToolResults.has(ti);
                    return (
                      <div key={ti} className="rounded border border-teal-100 bg-teal-50/30 px-2.5 py-1.5">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Wrench className="w-3 h-3 text-teal-500" />
                          <span className="text-[11px] font-semibold text-teal-700">{displayName.replace(/_/g, ' ')}</span>
                          {serverLabel && (
                            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-600">{serverLabel}</span>
                          )}
                        </div>
                        {tc.arguments && (
                          <pre className="text-[11px] text-gray-600 whitespace-pre-wrap break-words font-mono bg-white/70 border border-gray-100 rounded px-2 py-1 mb-1 max-h-32 overflow-y-auto">
                            {formatToolArgs(tc.arguments)}
                          </pre>
                        )}
                        {tc.result && (
                          <div>
                            <button
                              type="button"
                              onClick={() => toggleToolResult(ti)}
                              className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-700 transition-colors mb-0.5"
                            >
                              {isResultExpanded ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
                              <span>Результат{isResultLong && !isResultExpanded ? ` (${tc.result.length} символов)` : ''}</span>
                            </button>
                            {isResultExpanded && (
                              <pre className="text-[11px] text-gray-600 whitespace-pre-wrap break-words font-mono bg-white/70 border border-gray-100 rounded px-2 py-1 max-h-48 overflow-y-auto">
                                {tc.result}
                              </pre>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Output -- collapsible */}
          {step.content && (
            <div className="border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowOutput(v => !v)}
                className="w-full flex items-center gap-1.5 px-3 py-1.5 text-left hover:bg-gray-50 transition-colors"
              >
                <FileText className="w-3 h-3 text-gray-400" />
                <span className="text-[11px] font-medium text-gray-500">Результат</span>
                <span className="text-[10px] text-gray-400 font-mono">{step.content.length} chars</span>
                <span className="flex-1" />
                <CopyButton text={step.content} />
                {showOutput
                  ? <ChevronDown className="w-3 h-3 text-gray-400" />
                  : <ChevronRight className="w-3 h-3 text-gray-400" />
                }
              </button>
              {showOutput && (
                <div className="px-3 pb-2">
                  <div className="text-[11px] text-gray-600 whitespace-pre-wrap leading-relaxed max-h-52 overflow-y-auto rounded-md bg-gray-50 p-2.5 border border-gray-100">
                    {step.content}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tab definitions ──────────────────────────────────────────────────

type TabId = 'pipeline' | 'rag' | 'memory' | 'tokens' | 'facts' | 'strategy';

interface TabDef {
  id: TabId;
  label: string;
}

// ── Main Component ────────────────────────────────────────────────────

export function DebugPanel({ debugData, isLoading }: DebugPanelProps) {
  const [expandedLayers, setExpandedLayers] = useState<Set<number>>(new Set());
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [expandedRagChunks, setExpandedRagChunks] = useState<Set<number>>(new Set());
  const [expandedRagDocuments, setExpandedRagDocuments] = useState<Set<number>>(new Set());

  const toggleLayer = (i: number) => {
    setExpandedLayers(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
  };
  const toggleStep = (i: number) => {
    setExpandedSteps(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
  };
  const toggleRagChunk = (i: number) => {
    setExpandedRagChunks(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
  };
  const toggleRagDocument = (i: number) => {
    setExpandedRagDocuments(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
  };

  // Pipeline data comes from either pipelineData field or strategyMetadata (DB stores in strategy_metadata JSONB)
  const pipelineData = debugData.pipelineData
    || (debugData.strategyType === 'pipeline' && debugData.strategyMetadata
      ? debugData.strategyMetadata as unknown as NonNullable<MessageDebugData['pipelineData']>
      : null);
  const isPipeline = debugData.strategyType === 'pipeline' && pipelineData;

  // Build available tabs
  const availableTabs = useMemo(() => {
    const tabs: TabDef[] = [];
    if (isPipeline) {
      tabs.push({ id: 'pipeline', label: 'Pipeline' });
    }
    if (debugData.rag) {
      tabs.push({ id: 'rag', label: 'RAG' });
    }
    if (debugData.memoryLayers && debugData.memoryLayers.length > 0) {
      tabs.push({ id: 'memory', label: 'Память' });
    }
    if (debugData.tokenBreakdown && Object.keys(debugData.tokenBreakdown).length > 0) {
      tabs.push({ id: 'tokens', label: 'Токены' });
    }
    if (debugData.strategyType === 'sticky_facts') {
      tabs.push({ id: 'facts', label: 'Факты' });
    }
    if (debugData.strategyMetadata && Object.keys(debugData.strategyMetadata).length > 0 && !isPipeline) {
      tabs.push({ id: 'strategy', label: 'Стратегия' });
    }
    return tabs;
  }, [debugData, isPipeline]);

  const [activeTab, setActiveTab] = useState<TabId | null>(null);
  const currentTab = activeTab && availableTabs.some(t => t.id === activeTab) ? activeTab : (availableTabs[0]?.id ?? null);

  const meta = debugData.meta;

  if (isLoading) {
    return (
      <div className="ml-11 mt-1.5 text-[11px] text-gray-400">
        Загрузка debug данных...
      </div>
    );
  }

  return (
    <div className="ml-11 mt-1.5">
      <div className="border border-gray-200 rounded-xl bg-white shadow-sm max-w-2xl overflow-hidden">
        {/* ── Summary Bar ────────────────────────────────────── */}
        <div className="px-4 py-2.5 flex flex-wrap items-center gap-2 border-b border-gray-100 bg-gray-50/50">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-medium">
            {STRATEGY_LABELS[debugData.strategyType] || debugData.strategyType || '\u2014'}
          </span>

          {meta?.appliedModel && (
            <span className="px-1.5 py-0.5 rounded bg-gray-200 text-[10px] font-mono text-gray-600">
              {meta.appliedModel}
            </span>
          )}

          {meta?.totalTokens != null && (
            <span className="flex items-center gap-1 text-[10px] text-gray-500">
              <Hash className="w-3 h-3" />
              {formatTokens(meta.totalTokens)} tok
            </span>
          )}

          {meta?.cost != null && (
            <span className="flex items-center gap-1 text-[10px] text-gray-500">
              <Coins className="w-3 h-3" />
              {formatCost(meta.cost)}
            </span>
          )}

          {meta?.durationMs != null && (
            <span className="flex items-center gap-1 text-[10px] text-gray-500">
              <Clock className="w-3 h-3" />
              {formatDuration(meta.durationMs)}
            </span>
          )}

          {meta?.contextUsedTokens != null && meta?.contextMaxTokens != null && (
            <span className="text-[10px] text-gray-500">
              Context: {formatTokens(meta.contextUsedTokens)}/{formatTokens(meta.contextMaxTokens)}
              {' '}({Math.round((meta.contextUsedTokens / meta.contextMaxTokens) * 100)}%)
            </span>
          )}

          {debugData.contextMessagesCount > 0 && (
            <span className="text-[10px] text-gray-500">
              {debugData.contextMessagesCount} &rarr; {debugData.contextMessagesAfterTruncation} сообщ.
              {debugData.contextMessagesCount > debugData.contextMessagesAfterTruncation && (
                <span className="text-red-400 ml-1">
                  (-{debugData.contextMessagesCount - debugData.contextMessagesAfterTruncation})
                </span>
              )}
            </span>
          )}

          {debugData.rag && (
            <span className={`flex items-center gap-1 text-[10px] ${
              debugData.rag.enabled ? 'text-emerald-600' : 'text-gray-400'
            }`}>
              <Database className="w-3 h-3" />
              RAG: {debugData.rag.enabled ? `${debugData.rag.matchCount} фрагм.` : 'выключен'}
            </span>
          )}
        </div>

        {/* ── Tabs Bar ───────────────────────────────────────── */}
        {availableTabs.length > 0 && (
          <div className="flex border-b border-gray-100">
            {availableTabs.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-[11px] font-medium transition-colors relative ${
                  currentTab === tab.id
                    ? 'text-indigo-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
                {currentTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />
                )}
              </button>
            ))}
          </div>
        )}

        {/* ── Tab Content ────────────────────────────────────── */}
        <div className="px-4 py-3">

          {/* ── Pipeline Steps ──────────────────────────────── */}
          {currentTab === 'pipeline' && isPipeline && pipelineData && (
            <div>
              {/* Summary stats */}
              <div className="flex flex-wrap gap-2 mb-3">
                <Stat icon={<Hash className="w-3 h-3 text-gray-400" />} label="Попыток" value={String(pipelineData.totalAttempts)} />
                <Stat icon={<Coins className="w-3 h-3 text-gray-400" />} label="Стоимость" value={formatCost(pipelineData.totalCost)} />
                <Stat icon={<Hash className="w-3 h-3 text-gray-400" />} label="Токены" value={formatTokens(pipelineData.totalTokens)} />
              </div>

              {/* Timeline layout */}
              <div className="relative">
                <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-gray-200" />
                {pipelineData.steps.map((step, i) => {
                  const stepColors = STEP_COLORS[step.stepType] || STEP_COLORS.planning;
                  return (
                    <div key={i} className="relative pl-8 pb-3">
                      <div className={`absolute left-1.5 top-3 w-3 h-3 rounded-full border-2 ${stepColors.dot}`} />
                      <PipelineStepCard
                        step={step}
                        index={i}
                        isExpanded={expandedSteps.has(i)}
                        onToggle={() => toggleStep(i)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── RAG Context ───────────────────────────────── */}
          {currentTab === 'rag' && debugData.rag && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Stat
                  icon={<Database className="w-3 h-3 text-emerald-500" />}
                  label="Состояние"
                  value={debugData.rag.enabled ? 'включён' : 'выключен'}
                />
                <Stat
                  icon={<Search className="w-3 h-3 text-emerald-500" />}
                  label="Найдено"
                  value={String(debugData.rag.matchCount)}
                />
              </div>

              {debugData.rag.matches.length > 0 ? (
                <div className="space-y-2">
                  {debugData.rag.matches.map((match, i) => {
                    const metadata = match.document?.metadata || {};
                    const channelName = typeof metadata.channel_name === 'string'
                      ? metadata.channel_name
                      : match.document?.sourceKey;
                    const chunkExpanded = expandedRagChunks.has(i);
                    const documentExpanded = expandedRagDocuments.has(i);
                    const content = match.content || '';
                    const fullText = match.document?.fullText || '';

                    return (
                      <div key={`${match.chunkId}-${i}`} className="rounded-lg border border-emerald-100 bg-emerald-50/30 overflow-hidden">
                        <div className="px-3 py-2 bg-emerald-100/60 border-b border-emerald-100">
                          <div className="flex items-center gap-2">
                            <Database className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                            <span className="text-xs font-semibold text-emerald-700 flex-1">
                              RAG #{match.rank}
                            </span>
                            <span className="text-[10px] font-mono text-emerald-700">
                              {formatPercent(match.similarity)}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-emerald-700/80">
                            <span>сообщение: <span className="font-mono">{match.document?.externalId || 'не найдено'}</span></span>
                            <span>чанк: <span className="font-mono">{match.chunkIndex ?? '—'}</span></span>
                            <span>дата: <span className="font-mono">{formatDate(match.document?.publishedAt)}</span></span>
                            {channelName && <span>источник: <span className="font-medium">{channelName}</span></span>}
                          </div>
                        </div>

                        {!match.found ? (
                          <div className="px-3 py-2 text-[11px] text-amber-700 bg-amber-50">
                            Чанк не найден в текущем RAG-индексе. В debug сохранены только идентификаторы: {match.chunkId}
                          </div>
                        ) : (
                          <div className="bg-white">
                            <button
                              type="button"
                              onClick={() => toggleRagChunk(i)}
                              className="w-full flex items-center gap-1.5 px-3 py-1.5 text-left hover:bg-emerald-50/50 transition-colors"
                            >
                              <FileText className="w-3 h-3 text-emerald-500" />
                              <span className="text-[11px] font-medium text-emerald-700">Фрагмент</span>
                              <span className="text-[10px] text-emerald-500 font-mono">{match.charCount ?? content.length} симв.</span>
                              <span className="flex-1" />
                              {content && <CopyButton text={content} />}
                              {chunkExpanded
                                ? <ChevronDown className="w-3 h-3 text-emerald-500" />
                                : <ChevronRight className="w-3 h-3 text-emerald-500" />
                              }
                            </button>
                            {chunkExpanded && (
                              <div className="px-3 pb-2">
                                <div className="text-[11px] text-gray-600 whitespace-pre-wrap leading-relaxed max-h-52 overflow-y-auto rounded-md bg-gray-50 p-2.5 border border-gray-100">
                                  {content || 'Фрагмент пуст'}
                                </div>
                              </div>
                            )}

                            {fullText && (
                              <div className="border-t border-gray-100">
                                <button
                                  type="button"
                                  onClick={() => toggleRagDocument(i)}
                                  className="w-full flex items-center gap-1.5 px-3 py-1.5 text-left hover:bg-gray-50 transition-colors"
                                >
                                  <MessageSquare className="w-3 h-3 text-gray-500" />
                                  <span className="text-[11px] font-medium text-gray-600">Полное сообщение</span>
                                  <span className="text-[10px] text-gray-400 font-mono">{fullText.length} симв.</span>
                                  <span className="flex-1" />
                                  <CopyButton text={fullText} />
                                  {documentExpanded
                                    ? <ChevronDown className="w-3 h-3 text-gray-400" />
                                    : <ChevronRight className="w-3 h-3 text-gray-400" />
                                  }
                                </button>
                                {documentExpanded && (
                                  <div className="px-3 pb-2">
                                    <div className="text-[11px] text-gray-600 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto rounded-md bg-gray-50 p-2.5 border border-gray-100">
                                      {fullText}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            <div className="border-t border-gray-100 px-3 py-1.5 text-[10px] text-gray-400 font-mono break-all">
                              chunkId: {match.chunkId}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
                  {debugData.rag.enabled
                    ? 'RAG был включён, но релевантные фрагменты не прошли порог отбора'
                    : 'RAG был выключен для этого сообщения'}
                </div>
              )}
            </div>
          )}

          {/* ── Memory Layers ──────────────────────────────── */}
          {currentTab === 'memory' && debugData.memoryLayers && debugData.memoryLayers.length > 0 && (
            <div className="space-y-1.5">
              {debugData.memoryLayers.map((layer, i) => {
                const cfg = LAYER_CONFIG[layer.type];
                const isExpanded = expandedLayers.has(i);
                return (
                  <div key={i} className={`rounded-lg border ${cfg.border} overflow-hidden`}>
                    <button
                      type="button"
                      onClick={() => layer.content && toggleLayer(i)}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 ${cfg.bg} ${layer.content ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                      <span className={`text-[11px] font-medium ${cfg.text}`}>{cfg.emoji} {cfg.label}</span>
                      <span className={`text-[11px] font-mono ${cfg.text} opacity-70`}>{layer.tokenCount} tok</span>
                      <span className={`text-[11px] ${cfg.text} truncate flex-1 text-left opacity-70`}>{layer.label}</span>
                      {layer.content && <CopyButton text={layer.content} />}
                      {layer.content && (isExpanded
                        ? <ChevronDown className={`w-3.5 h-3.5 ${cfg.text} flex-shrink-0`} />
                        : <ChevronRight className={`w-3.5 h-3.5 ${cfg.text} flex-shrink-0`} />
                      )}
                    </button>
                    {isExpanded && layer.content && (
                      <div className={`px-3 py-2 text-[11px] font-mono ${cfg.text} whitespace-pre-wrap break-words border-t ${cfg.border} bg-white`}>
                        {layer.content}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Token Breakdown ─────────────────────────────── */}
          {currentTab === 'tokens' && debugData.tokenBreakdown && Object.keys(debugData.tokenBreakdown).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(debugData.tokenBreakdown).map(([key, val]) => (
                <div key={key} className="flex items-center gap-1 px-2 py-1 bg-gray-50 rounded-md border border-gray-100">
                  <span className="text-[10px] text-gray-500">{key}</span>
                  <span className="text-[11px] font-mono font-medium text-gray-700">{typeof val === 'number' ? val.toLocaleString() : String(val)}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── Facts ──────────────────────────────────────── */}
          {currentTab === 'facts' && debugData.strategyType === 'sticky_facts' && (
            <div className="space-y-2">
              <div>
                <div className="text-[11px] text-gray-500 mb-1">До ответа:</div>
                {debugData.factsSnapshot && debugData.factsSnapshot.length > 0 ? (
                  <div className="space-y-0.5">
                    {debugData.factsSnapshot.map((fact, i) => (
                      <div key={i} className="text-[11px] font-mono px-2 py-0.5 bg-gray-50 rounded">
                        <span className="text-teal-600 font-medium">{fact.key}</span>
                        <span className="text-gray-400 mx-1">=</span>
                        <span className="text-gray-700">{fact.value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-gray-400 italic">(пусто)</div>
                )}
              </div>
              {debugData.factsAfter && (
                <div>
                  <div className="text-[11px] text-gray-500 mb-1">После извлечения:</div>
                  {debugData.factsAfter.length > 0 ? (
                    <div className="space-y-0.5">
                      {debugData.factsAfter.map((fact, i) => (
                        <div key={i} className="text-[11px] font-mono px-2 py-0.5 bg-gray-50 rounded">
                          <span className="text-emerald-600 font-medium">{fact.key}</span>
                          <span className="text-gray-400 mx-1">=</span>
                          <span className="text-gray-700">{fact.value}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11px] text-gray-400 italic">(пусто)</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Strategy Metadata ──────────────────────────── */}
          {currentTab === 'strategy' && debugData.strategyMetadata && Object.keys(debugData.strategyMetadata).length > 0 && !isPipeline && (
            <div className="space-y-1">
              {Object.entries(debugData.strategyMetadata)
                .filter(([key]) => key !== 'factsSnapshot')
                .map(([key, val]) => (
                  <div key={key} className="flex items-baseline gap-2 text-[11px]">
                    <span className="text-gray-500 min-w-[100px]">{key}</span>
                    <span className="font-mono text-gray-700 break-all">
                      {typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val)}
                    </span>
                  </div>
                ))}
            </div>
          )}

          {/* No tabs available */}
          {availableTabs.length === 0 && (
            <div className="text-[11px] text-gray-400 italic py-2">
              Нет детальных данных для отображения
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
