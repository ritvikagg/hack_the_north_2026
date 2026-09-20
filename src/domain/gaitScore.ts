export interface GaitScore {
  model_type: string;
  positive_class: 'genuine';
  genuine_probability: number;
  decision: 'genuine' | 'altered_gait';
  feature_values: Record<string, number>;
  limitations: string[];
}

export function parseGaitScore(value: unknown): GaitScore {
  const score = value as GaitScore | null;
  if (!score || typeof score.model_type !== 'string' || score.positive_class !== 'genuine'
    || !Number.isFinite(score.genuine_probability) || score.genuine_probability < 0 || score.genuine_probability > 1
    || !['genuine', 'altered_gait'].includes(score.decision)
    || score.decision !== (score.genuine_probability >= .5 ? 'genuine' : 'altered_gait')
    || !score.feature_values || typeof score.feature_values !== 'object'
    || !Object.keys(score.feature_values).length || !Object.values(score.feature_values).every(Number.isFinite)
    || !Array.isArray(score.limitations) || !score.limitations.every(item => typeof item === 'string')) {
    throw new Error('The scoring service returned an invalid result.');
  }
  return score;
}
