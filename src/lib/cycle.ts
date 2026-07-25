export const BLEEDING_LEVELS = ['none', 'spotting', 'light', 'medium', 'heavy'] as const;

export const CYCLE_SYMPTOMS = [
  'cramps',
  'headache',
  'migraine',
  'bloating',
  'breast_tenderness',
  'fatigue',
  'mood_change',
  'sleep_change',
  'back_pain',
  'nausea',
  'digestive_change',
  'acne',
  'cravings',
  'other',
] as const;

export type BleedingLevel = (typeof BLEEDING_LEVELS)[number];
export type CycleSymptom = (typeof CYCLE_SYMPTOMS)[number];

export type CycleObservation = {
  date: string;
  periodStarted: boolean | null;
  periodDurationDays: number | null;
  bleeding: BleedingLevel | null;
  symptoms: CycleSymptom[];
  symptomSeverity: number | null;
  notes: string | null;
};

export type CycleObservationUpdate = {
  date: string;
  periodStarted?: boolean | null;
  periodDurationDays?: number | null;
  bleeding?: BleedingLevel | null;
  symptoms?: CycleSymptom[] | null;
  symptomSeverity?: number | null;
  notes?: string | null;
};

export type CycleSummary = {
  periodStartDates: string[];
  cycleLengthsDays: number[];
  medianCycleLengthDays: number | null;
  periodDurationsDays: number[];
  medianPeriodDurationDays: number | null;
  latestPeriodStart: string | null;
  estimatedNextStartDate: string | null;
  estimateConfidence: 'insufficient_data' | 'low' | 'medium';
};

type CycleObservationRow = {
  observation_date: string;
  period_started: number | null;
  period_duration_days: number | null;
  bleeding: string | null;
  symptoms_json: string | null;
  symptom_severity: number | null;
  notes: string | null;
};

function parseSymptoms(value: string | null): CycleSymptom[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is CycleSymptom =>
      CYCLE_SYMPTOMS.includes(item as CycleSymptom),
    );
  } catch {
    return [];
  }
}

function rowToObservation(row: CycleObservationRow): CycleObservation {
  return {
    date: row.observation_date,
    periodStarted: row.period_started === null ? null : row.period_started === 1,
    periodDurationDays: row.period_duration_days,
    bleeding: BLEEDING_LEVELS.includes(row.bleeding as BleedingLevel)
      ? (row.bleeding as BleedingLevel)
      : null,
    symptoms: parseSymptoms(row.symptoms_json),
    symptomSeverity: row.symptom_severity,
    notes: row.notes,
  };
}

function daysBetween(start: string, end: string): number {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  return Math.round((endMs - startMs) / 86_400_000);
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

export function summarizeCycleHistory(observations: CycleObservation[]): CycleSummary {
  const periodStartDates = observations
    .filter((observation) => observation.periodStarted === true)
    .map((observation) => observation.date)
    .sort();
  const cycleLengthsDays = periodStartDates
    .slice(1)
    .map((date, index) => daysBetween(periodStartDates[index]!, date))
    .filter((days) => days >= 15 && days <= 60);
  const medianCycleLengthDays = median(cycleLengthsDays);
  const periodDurationsDays = observations
    .filter(
      (observation) =>
        observation.periodStarted === true && observation.periodDurationDays !== null,
    )
    .map((observation) => observation.periodDurationDays!)
    .filter((days) => days >= 1 && days <= 14);
  const medianPeriodDurationDays = median(periodDurationsDays);
  const latestPeriodStart = periodStartDates.at(-1) ?? null;
  const estimatedNextStartDate =
    latestPeriodStart && medianCycleLengthDays !== null && cycleLengthsDays.length >= 2
      ? addDays(latestPeriodStart, Math.round(medianCycleLengthDays))
      : null;
  const spread =
    cycleLengthsDays.length > 0
      ? Math.max(...cycleLengthsDays) - Math.min(...cycleLengthsDays)
      : null;

  return {
    periodStartDates,
    cycleLengthsDays,
    medianCycleLengthDays,
    periodDurationsDays,
    medianPeriodDurationDays,
    latestPeriodStart,
    estimatedNextStartDate,
    estimateConfidence:
      cycleLengthsDays.length < 2
        ? 'insufficient_data'
        : spread !== null && spread <= 4
          ? 'medium'
          : 'low',
  };
}

async function getCycleObservation(db: D1Database, date: string): Promise<CycleObservation | null> {
  const row = await db
    .prepare(
      `SELECT observation_date, period_started, period_duration_days, bleeding, symptoms_json,
              symptom_severity, notes
         FROM cycle_observations
        WHERE observation_date = ?`,
    )
    .bind(date)
    .first<CycleObservationRow>();
  return row ? rowToObservation(row) : null;
}

export async function saveCycleObservation(
  db: D1Database,
  update: CycleObservationUpdate,
): Promise<CycleObservation> {
  const hasUpdate = Object.entries(update).some(
    ([key, value]) => key !== 'date' && value !== undefined,
  );
  if (!hasUpdate) {
    throw new Error('At least one cycle observation field is required');
  }

  const existing = await getCycleObservation(db, update.date);
  const observation: CycleObservation = {
    date: update.date,
    periodStarted:
      update.periodStarted === undefined ? (existing?.periodStarted ?? null) : update.periodStarted,
    periodDurationDays:
      update.periodDurationDays === undefined
        ? (existing?.periodDurationDays ?? null)
        : update.periodDurationDays,
    bleeding: update.bleeding === undefined ? (existing?.bleeding ?? null) : update.bleeding,
    symptoms:
      update.symptoms === undefined
        ? (existing?.symptoms ?? [])
        : [...new Set(update.symptoms ?? [])],
    symptomSeverity:
      update.symptomSeverity === undefined
        ? (existing?.symptomSeverity ?? null)
        : update.symptomSeverity,
    notes: update.notes === undefined ? (existing?.notes ?? null) : update.notes?.trim() || null,
  };

  await db
    .prepare(
      `INSERT INTO cycle_observations (
         observation_date, period_started, period_duration_days, bleeding,
         symptoms_json, symptom_severity, notes, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(observation_date) DO UPDATE SET
         period_started = excluded.period_started,
         period_duration_days = excluded.period_duration_days,
         bleeding = excluded.bleeding,
         symptoms_json = excluded.symptoms_json,
         symptom_severity = excluded.symptom_severity,
         notes = excluded.notes,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      observation.date,
      observation.periodStarted === null ? null : observation.periodStarted ? 1 : 0,
      observation.periodDurationDays,
      observation.bleeding,
      JSON.stringify(observation.symptoms),
      observation.symptomSeverity,
      observation.notes,
    )
    .run();

  return observation;
}

export async function listCycleObservations(
  db: D1Database,
  start: string,
  end: string,
): Promise<CycleObservation[]> {
  const result = await db
    .prepare(
      `SELECT observation_date, period_started, period_duration_days, bleeding, symptoms_json,
              symptom_severity, notes
         FROM cycle_observations
        WHERE observation_date BETWEEN ? AND ?
        ORDER BY observation_date ASC`,
    )
    .bind(start, end)
    .all<CycleObservationRow>();
  return result.results.map(rowToObservation);
}
