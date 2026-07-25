import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Env } from '../env';
import {
  BLEEDING_LEVELS,
  CYCLE_SYMPTOMS,
  listCycleObservations,
  saveCycleObservation,
  summarizeCycleHistory,
} from '../lib/cycle';
import { assertIsoDate, normalizeRange } from '../lib/date';
import { toolErrorResult } from '../lib/errors';

const BleedingSchema = z.enum(BLEEDING_LEVELS);
const SymptomSchema = z.enum(CYCLE_SYMPTOMS);

const ObservationSchema = z.object({
  date: z.string(),
  periodStarted: z.boolean().nullable(),
  periodDurationDays: z.number().int().min(1).max(14).nullable(),
  bleeding: BleedingSchema.nullable(),
  symptoms: z.array(SymptomSchema),
  symptomSeverity: z.number().int().min(0).max(3).nullable(),
  notes: z.string().nullable(),
});

const SummarySchema = z.object({
  periodStartDates: z.array(z.string()),
  cycleLengthsDays: z.array(z.number().int()),
  medianCycleLengthDays: z.number().nullable(),
  periodDurationsDays: z.array(z.number().int()),
  medianPeriodDurationDays: z.number().nullable(),
  latestPeriodStart: z.string().nullable(),
  estimatedNextStartDate: z.string().nullable(),
  estimateConfidence: z.enum(['insufficient_data', 'low', 'medium']),
});

export function registerCycleTools(server: McpServer, env: Env): void {
  const db = env.HEALTH_DB;
  if (!db) return;

  server.registerTool(
    'save_cycle_observation',
    {
      title: 'Save menstrual cycle observation',
      description:
        'Saves or updates a private menstrual-cycle observation in this profile database. Use only when the user explicitly asks to record or correct a date. This does not write to Google Health.',
      inputSchema: {
        date: z.string().describe('Observation date in YYYY-MM-DD.'),
        periodStarted: z
          .boolean()
          .nullable()
          .optional()
          .describe('True when this date is the first day of menstrual bleeding. Null clears it.'),
        periodDurationDays: z
          .number()
          .int()
          .min(1)
          .max(14)
          .nullable()
          .optional()
          .describe(
            'Total number of bleeding days for a period-start observation. Null clears it.',
          ),
        bleeding: BleedingSchema.nullable()
          .optional()
          .describe('Bleeding level. Null clears the recorded level.'),
        symptoms: z
          .array(SymptomSchema)
          .max(14)
          .nullable()
          .optional()
          .describe('Body reactions or symptoms. Null clears the symptom list.'),
        symptomSeverity: z
          .number()
          .int()
          .min(0)
          .max(3)
          .nullable()
          .optional()
          .describe('Overall symptom severity: 0 none, 1 mild, 2 moderate, 3 severe.'),
        notes: z
          .string()
          .max(200)
          .nullable()
          .optional()
          .describe('Optional short private note. Null or an empty string clears it.'),
      },
      outputSchema: ObservationSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({
      date,
      periodStarted,
      periodDurationDays,
      bleeding,
      symptoms,
      symptomSeverity,
      notes,
    }) => {
      try {
        assertIsoDate(date, 'date');
        const observation = await saveCycleObservation(db, {
          date,
          periodStarted,
          periodDurationDays,
          bleeding,
          symptoms,
          symptomSeverity,
          notes,
        });
        return {
          structuredContent: observation,
          content: [{ type: 'text', text: JSON.stringify(observation, null, 2) }],
        };
      } catch (err) {
        return toolErrorResult(err);
      }
    },
  );

  server.registerTool(
    'get_cycle_history',
    {
      title: 'Menstrual cycle and symptom history',
      description:
        'Reads private menstrual-cycle starts, bleeding, and body reactions across a date range. Includes a simple cycle-length estimate that is not suitable for contraception or diagnosis.',
      inputSchema: {
        start: z.string().describe('YYYY-MM-DD'),
        end: z.string().describe('YYYY-MM-DD'),
      },
      outputSchema: {
        observations: z.array(ObservationSchema),
        summary: SummarySchema,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ start, end }) => {
      try {
        const range = normalizeRange(start, end);
        const observations = await listCycleObservations(db, range.start, range.end);
        const data = {
          observations,
          summary: summarizeCycleHistory(observations),
        };
        return {
          structuredContent: data,
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        };
      } catch (err) {
        return toolErrorResult(err);
      }
    },
  );
}
