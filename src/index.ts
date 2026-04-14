export interface InvarianceConfig {
  apiKey: string;
  apiUrl?: string;
}

export class Invariance {
  static init(config: InvarianceConfig): Invariance {
    return new Invariance(config);
  }

  private constructor(readonly config: InvarianceConfig) {}
}

