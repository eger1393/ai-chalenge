import type { ReviewContext } from "../../domain/review-context.js";
import type { DiffProvider } from "../../application/ports.js";

export class FallbackDiffProvider implements DiffProvider {
  constructor(private readonly providers: DiffProvider[]) {}

  async getDiff(context: ReviewContext): Promise<string | undefined> {
    for (const provider of this.providers) {
      const diff = await provider.getDiff(context);

      if (diff?.trim()) {
        return diff;
      }
    }

    return undefined;
  }
}
