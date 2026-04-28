export class ProcessEnv {
  getOptional(name: string): string | undefined {
    return process.env[name];
  }

  getRequired(name: string): string {
    const value = process.env[name];

    if (!value) {
      throw new Error(`${name} is required.`);
    }

    return value;
  }
}
