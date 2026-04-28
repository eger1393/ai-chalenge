import type { OutputWriter } from "../../application/ports.js";

export class ConsoleOutputWriter implements OutputWriter {
  write(value: unknown): void {
    console.log(JSON.stringify(value, null, 2));
  }
}
