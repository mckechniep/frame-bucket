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
  /**
   * All remaining :root custom properties not classified as color/typeScale/spacing —
   * including raw `--font-*` family declarations, radii, shadows, line-heights, transitions.
   * This is the complete remainder, so tokens.css can be faithfully reproduced from
   * colors + typeScale + spacing + other. The `fonts` array is the structured view of
   * font families; raw `--font-*` declarations also appear here for CSS reproduction.
   */
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
