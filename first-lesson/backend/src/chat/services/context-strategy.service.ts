import { Injectable, Logger } from '@nestjs/common';
import { ContextStrategyType, ContextStrategyResult, IContextStrategy } from '../strategies/context-strategy.interface';
import { SlidingWindowStrategy } from '../strategies/sliding-window.strategy';
import { StickyFactsStrategy } from '../strategies/sticky-facts.strategy';
import { BranchingStrategy } from '../strategies/branching.strategy';

@Injectable()
export class ContextStrategyService {
  private readonly logger = new Logger(ContextStrategyService.name);
  private readonly strategies: Map<ContextStrategyType, IContextStrategy>;

  constructor(
    private readonly slidingWindow: SlidingWindowStrategy,
    private readonly stickyFacts: StickyFactsStrategy,
    private readonly branching: BranchingStrategy,
  ) {
    this.strategies = new Map<ContextStrategyType, IContextStrategy>([
      ['sliding_window', this.slidingWindow],
      ['sticky_facts', this.stickyFacts],
      ['branching', this.branching],
    ]);
  }

  getStrategy(type: ContextStrategyType): IContextStrategy {
    const strategy = this.strategies.get(type);
    if (!strategy) {
      this.logger.warn(`Unknown strategy type: ${type}, falling back to sliding_window`);
      return this.slidingWindow;
    }
    return strategy;
  }

  async prepareContext(
    strategyType: ContextStrategyType,
    params: {
      conversationId: string;
      historyMessages: Array<{ role: string; content: string }>;
      currentMessage: string;
      model: string;
      systemPrompt?: string;
      contextLimit?: number;
      strategyParams?: Record<string, unknown>;
    },
  ): Promise<ContextStrategyResult> {
    const strategy = this.getStrategy(strategyType);
    this.logger.debug(`Preparing context with strategy: ${strategyType}`);
    return strategy.prepareContext(params);
  }
}
