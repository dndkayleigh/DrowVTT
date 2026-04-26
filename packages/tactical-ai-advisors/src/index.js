export class NullTacticalAdvisor {
  id = 'null_advisor';
  label = 'No LLM Advisor';

  async rankCandidates({ candidates = [] } = {}) {
    return candidates.map((candidate, index) => ({
      candidateId: candidate.id,
      rank: index + 1,
      rationale: 'LLM advisor disabled.'
    }));
  }

  async inferStance() {
    return {
      stance: 'opportunistic',
      confidence: 0,
      rationale: 'LLM advisor disabled.'
    };
  }
}

export function buildCompactAdvisorPrompt({ encounter, candidates = [] } = {}) {
  return [
    'Rank the tactical candidates. Do not invent new actions.',
    `Encounter: ${encounter?.id || 'unknown'}`,
    ...candidates.map((candidate, index) => `${index + 1}. ${candidate.label}`)
  ].join('\n');
}

export function parseAdvisorRanking(text = '') {
  return String(text || '').split('\n')
    .map((line) => line.match(/^\s*(\d+)[.)]\s*([^\s].*)$/))
    .filter(Boolean)
    .map((match) => ({ rank: Number(match[1]), text: match[2].trim() }));
}
