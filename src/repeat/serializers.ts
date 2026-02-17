import { PeriodUnit, Repeat, Repetition } from './repeatTypes';

const SERIALIZED_TRUE = 'true';
export const SERIALIZED_FALSE = 'false';

function serializeRepeatPeriodUnit(
  repeatPeriodUnit: PeriodUnit,
  repeatPeriod: number,
): string {
  const suffix = (repeatPeriod === 1) ? '' : 's';
  return `${repeatPeriodUnit.toLowerCase()}${suffix}`;
}

const joinedUnits = 'minute|hour|day|week|month|year';

export function serializeRepeat({
  repeatStrategy,
  repeatPeriod,
  repeatPeriodUnit,
  repeatTimeOfDay,
  repeatWeekdays,
  fsrs_stability,
  fsrs_difficulty,
  fsrs_reps,
  fsrs_lapses,
  fsrs_last_review,
}: Repeat | Repetition): string {
  if (repeatStrategy === 'FSRS') {
    return 'fsrs';
  }

  // Handle weekday-based repetitions
  if (repeatPeriodUnit === 'WEEKDAYS' && repeatWeekdays && repeatWeekdays.length > 0) {
    const weekdayString = repeatWeekdays.join(', ');
    return [
      ...(repeatStrategy === 'PERIODIC' ? [] : ['spaced']),
      'every',
      weekdayString,
      ...(repeatTimeOfDay === 'AM' ? [] : ['in the evening']),
    ].join(' ');
  }

  // Handle traditional short forms
  if (repeatStrategy === 'PERIODIC'
    && repeatPeriod === 1
    && repeatPeriodUnit !== 'MINUTE'
    && repeatPeriodUnit !== 'HOUR'
    && repeatTimeOfDay === 'AM'
  ) {
    switch (repeatPeriodUnit) {
      case 'DAY':
        return 'daily';
      case 'WEEK':
        return 'weekly';
      case 'MONTH':
        return 'monthly';
      case 'YEAR':
        return 'yearly';
      default:
        break;
    }
  }

  // Handle traditional time-based repetitions
  return [
    ...(repeatStrategy === 'PERIODIC' ? [] : ['spaced']),
    'every',
    ...(repeatPeriod === 1 ? [] : [`${repeatPeriod}`]),
    serializeRepeatPeriodUnit(repeatPeriodUnit, repeatPeriod),
    ...(repeatTimeOfDay === 'AM' ? [] : ['in the evening']),
  ].join(' ');
}

export function serializeRepetition(repetition: Repetition | 'DISMISS' | 'NEVER') {
  if (repetition === 'NEVER') {
    return {
      repeat: 'never',
      due_at: undefined,
      hidden: undefined,
    }
  } else if (repetition === 'DISMISS') {
    return {
      repeat: undefined,
      due_at: undefined,
    };
  } else {
    // If it's FSRS, we want to serialize the FSRS specific fields
    const serialized: any = {
      repeat: serializeRepeat(repetition),
      due_at: repetition.repeatDueAt.toISO(),
      hidden: repetition.hidden ? SERIALIZED_TRUE : SERIALIZED_FALSE,
    };

    if (repetition.repeatStrategy === 'FSRS') {
      if (repetition.fsrs_stability !== undefined) serialized.fsrs_stability = repetition.fsrs_stability;
      if (repetition.fsrs_difficulty !== undefined) serialized.fsrs_difficulty = repetition.fsrs_difficulty;
      if (repetition.fsrs_reps !== undefined) serialized.fsrs_reps = repetition.fsrs_reps;
      if (repetition.fsrs_lapses !== undefined) serialized.fsrs_lapses = repetition.fsrs_lapses;
      if (repetition.fsrs_last_review) serialized.fsrs_last_review = repetition.fsrs_last_review;
      if (repetition.fsrs_state !== undefined) serialized.fsrs_state = repetition.fsrs_state;
    }

    return serialized;
  }
}
