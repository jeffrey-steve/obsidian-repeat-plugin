import { DateTime } from 'luxon';

export type Strategy = 'SPACED' | 'PERIODIC' | 'FSRS';

export type PeriodUnit = 'HOUR' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' | 'WEEKDAYS';

export type TimeOfDay = 'AM' | 'PM';

export type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

// A parsed `repeat` property value.
export type Repeat = {
  repeatStrategy: Strategy,
  repeatPeriod: number,
  repeatPeriodUnit: PeriodUnit,
  repeatTimeOfDay: TimeOfDay,
  repeatWeekdays?: Weekday[],
  fsrs_stability?: number,
  fsrs_difficulty?: number,
  fsrs_reps?: number,
  fsrs_lapses?: number,
  fsrs_last_review?: string, // ISO date string
}

// A complete set of parsed repetition properties.
export interface Repetition extends Repeat {
  repeatDueAt: DateTime,
  hidden: boolean,
  virtual: boolean,
}

// A next-repeat choice shown in the review interface.
export type RepeatChoice = {
  text: string,
  nextRepetition: Repetition | 'DISMISS' | 'NEVER',
}
