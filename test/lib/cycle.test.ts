import { describe, expect, it, vi } from 'vitest';
import {
  type CycleObservation,
  listCycleObservations,
  saveCycleObservation,
  summarizeCycleHistory,
} from '../../src/lib/cycle';

describe('summarizeCycleHistory', () => {
  it('summarizes period starts and estimates the next start from a stable history', () => {
    const observations = [
      { date: '2026-04-01', periodStarted: true },
      { date: '2026-04-29', periodStarted: true },
      { date: '2026-05-28', periodStarted: true },
      { date: '2026-06-25', periodStarted: true },
    ].map(
      (value): CycleObservation => ({
        ...value,
        periodDurationDays: 5,
        bleeding: 'medium',
        symptoms: [],
        symptomSeverity: null,
        notes: null,
      }),
    );

    expect(summarizeCycleHistory(observations)).toEqual({
      periodStartDates: ['2026-04-01', '2026-04-29', '2026-05-28', '2026-06-25'],
      cycleLengthsDays: [28, 29, 28],
      medianCycleLengthDays: 28,
      periodDurationsDays: [5, 5, 5, 5],
      medianPeriodDurationDays: 5,
      latestPeriodStart: '2026-06-25',
      estimatedNextStartDate: '2026-07-23',
      estimateConfidence: 'medium',
    });
  });

  it('does not estimate with fewer than three period starts', () => {
    const observations: CycleObservation[] = [
      {
        date: '2026-06-01',
        periodStarted: true,
        periodDurationDays: 5,
        bleeding: 'light',
        symptoms: [],
        symptomSeverity: null,
        notes: null,
      },
      {
        date: '2026-06-29',
        periodStarted: true,
        periodDurationDays: 6,
        bleeding: 'medium',
        symptoms: [],
        symptomSeverity: null,
        notes: null,
      },
    ];

    expect(summarizeCycleHistory(observations).estimatedNextStartDate).toBeNull();
    expect(summarizeCycleHistory(observations).estimateConfidence).toBe('insufficient_data');
  });
});

describe('cycle database operations', () => {
  it('merges a partial update with an existing observation', async () => {
    const first = vi.fn(async () => ({
      observation_date: '2026-07-25',
      period_started: 1,
      period_duration_days: 6,
      bleeding: 'medium',
      symptoms_json: '["cramps"]',
      symptom_severity: 1,
      notes: null,
    }));
    const run = vi.fn(async () => ({ success: true }));
    const upsertBind = vi.fn(() => ({ run }));
    const selectBind = vi.fn(() => ({ first }));
    const prepare = vi.fn((sql: string) =>
      sql.includes('WHERE observation_date = ?') ? { bind: selectBind } : { bind: upsertBind },
    );
    const db = { prepare } as unknown as D1Database;

    await expect(
      saveCycleObservation(db, {
        date: '2026-07-25',
        symptoms: ['cramps', 'fatigue', 'cramps'],
        symptomSeverity: 2,
      }),
    ).resolves.toEqual({
      date: '2026-07-25',
      periodStarted: true,
      periodDurationDays: 6,
      bleeding: 'medium',
      symptoms: ['cramps', 'fatigue'],
      symptomSeverity: 2,
      notes: null,
    });
    expect(upsertBind).toHaveBeenCalledWith(
      '2026-07-25',
      1,
      6,
      'medium',
      '["cramps","fatigue"]',
      2,
      null,
    );
  });

  it('lists observations in the database response format', async () => {
    const all = vi.fn(async () => ({
      results: [
        {
          observation_date: '2026-07-25',
          period_started: 1,
          period_duration_days: 5,
          bleeding: 'light',
          symptoms_json: '["bloating","fatigue"]',
          symptom_severity: 1,
          notes: 'Short note',
        },
      ],
    }));
    const bind = vi.fn(() => ({ all }));
    const db = { prepare: vi.fn(() => ({ bind })) } as unknown as D1Database;

    await expect(listCycleObservations(db, '2026-07-01', '2026-07-31')).resolves.toEqual([
      {
        date: '2026-07-25',
        periodStarted: true,
        periodDurationDays: 5,
        bleeding: 'light',
        symptoms: ['bloating', 'fatigue'],
        symptomSeverity: 1,
        notes: 'Short note',
      },
    ]);
  });
});
