import { DateTime } from 'luxon';

export type Strategy = 'SPACED' | 'PERIODIC' | 'FSRS';

export type PeriodUnit = 'MINUTE' | 'HOUR' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' | 'WEEKDAYS';

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
  fsrs_state?: number, // 0=New, 1=Learning, 2=Review, 3=Relearning
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
  rating?: number, // 0=Manual/Skip, 1=Again, 2=Hard, 3=Good, 4=Easy
}
