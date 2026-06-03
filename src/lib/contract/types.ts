export interface DesignTokens {
  colors: { name: string; value: string; note?: string }[];
  fonts: {
    family: string;
    weights: number[];
    role: 'display' | 'body' | 'mono' | 'other';
    source?: string;
  }[];
  typeScale: { name: string; value: string }[];
  spacing: { name: string; value: string }[];
  other: { name: string; value: string }[];
  meta: { extractedFrom: string; recipeSummary: string; fallback: boolean };
}

export interface ContractNarrative {
  identity: string;
  rules: string;
  componentPatterns: string;
  howToExtend: string;
}

export interface StoredContract {
  tokens: DesignTokens;
  contractMd: string;
  tokensJson: string;
  tokensCss: string;
  modelId: string;
  cost: number;
  createdAt: string;
}
