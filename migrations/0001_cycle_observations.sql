CREATE TABLE IF NOT EXISTS cycle_observations (
  observation_date TEXT PRIMARY KEY,
  period_started INTEGER CHECK (period_started IS NULL OR period_started IN (0, 1)),
  period_duration_days INTEGER CHECK (
    period_duration_days IS NULL OR period_duration_days BETWEEN 1 AND 14
  ),
  bleeding TEXT CHECK (
    bleeding IS NULL OR bleeding IN ('none', 'spotting', 'light', 'medium', 'heavy')
  ),
  symptoms_json TEXT,
  symptom_severity INTEGER CHECK (
    symptom_severity IS NULL OR symptom_severity BETWEEN 0 AND 3
  ),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 200),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cycle_observations_period_start
  ON cycle_observations(period_started, observation_date);
