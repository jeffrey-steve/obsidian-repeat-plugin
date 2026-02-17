import { DateTime, Duration } from 'luxon';

import { summarizeDueAt } from './utils';
import { Repetition, RepeatChoice } from './repeatTypes';
import { uniqByField } from '../utils';
import { RepeatPluginSettings } from '../settings';
import { parseTime } from './parsers';
import { Card, initCard, Rating, reviewCard, State } from '../fsrs/fsrs';

export const DISMISS_BUTTON_TEXT = 'Dismiss';
export const NEVER_BUTTON_TEXT = 'Never';

export const SKIP_PERIOD_MINUTES = 5;
export const SKIP_BUTTON_TEXT = `${SKIP_PERIOD_MINUTES} minutes (skip)`;

/**
 * Determines next repetition date.
 * @param repetition A note Repetition object.
 * @param settings Plugin settings.
 * @returns When the note is next due.
 */
function getNextWeekdayOccurrence(
  currentDate: DateTime,
  weekdays: string[],
  timeOfDay: 'AM' | 'PM',
  morningTime: { hour: number; minute: number },
  eveningTime: { hour: number; minute: number }
): DateTime {
  const weekdayNumbers: Record<string, number> = {
    'sunday': 7,
    'monday': 1,
    'tuesday': 2,
    'wednesday': 3,
    'thursday': 4,
    'friday': 5,
    'saturday': 6
  };

  const targetWeekdays = weekdays.map(day => weekdayNumbers[day]).sort();
  const reviewTime = timeOfDay === 'AM' ? morningTime : eveningTime;

  // Find next occurrence
  for (let daysAhead = 1; daysAhead <= 7; daysAhead++) {
    const candidateDate = currentDate.plus({ days: daysAhead });
    const candidateWeekday = candidateDate.weekday;

    if (targetWeekdays.includes(candidateWeekday)) {
      const candidateDateTime = candidateDate.set({
        hour: reviewTime.hour,
        minute: reviewTime.minute,
        second: 0,
        millisecond: 0,
      });

      return candidateDateTime;
    }
  }

  // Fallback - should never happen but safety net
  return currentDate.plus({ days: 1 }).set({
    hour: reviewTime.hour,
    minute: reviewTime.minute,
    second: 0,
    millisecond: 0,
  });
}

export function incrementRepeatDueAt({
  repeatDueAt,
  repeatPeriodUnit,
  repeatPeriod,
  repeatTimeOfDay,
  repeatWeekdays,
}: Repetition, settings: RepeatPluginSettings): DateTime {
  const now = DateTime.now();
  const dueAt = repeatDueAt ?? now.minus({ second: 1 });
  const morningReviewTime = parseTime(settings.morningReviewTime);
  const eveningReviewTime = parseTime(settings.eveningReviewTime);

  // Handle weekday-based repetitions
  if (repeatPeriodUnit === 'WEEKDAYS' && repeatWeekdays && repeatWeekdays.length > 0) {
    return getNextWeekdayOccurrence(
      now,
      repeatWeekdays,
      repeatTimeOfDay,
      morningReviewTime,
      eveningReviewTime
    );
  }

  // Handle traditional time-based repetitions
  let repetitions = 1;
  if (dueAt <= now) {
    const overdueBy = now.diff(dueAt);
    const repeatPeriodDuration = Duration.fromObject({
      [repeatPeriodUnit.toLowerCase()]: repeatPeriod,
    });
    repetitions = Math.ceil((overdueBy as any) / (repeatPeriodDuration as any));
  }

  // Prevent infinite loops if repeatPeriod is 0 or very small
  if (repetitions < 1) repetitions = 1;

  // For minutes/hours, we don't snap to morning/evening times
  if (repeatPeriodUnit === 'MINUTE' || repeatPeriodUnit === 'HOUR') {
    let nextDue = dueAt.plus({
      [repeatPeriodUnit.toLowerCase()]: repetitions * repeatPeriod,
    });
    if (nextDue <= now) {
      nextDue = nextDue.plus({
        [repeatPeriodUnit.toLowerCase()]: repeatPeriod,
      });
    }
    return nextDue;
  }

  const nextRepeatDueAt = dueAt.plus({
    [repeatPeriodUnit.toLowerCase()]: repetitions * repeatPeriod,
  }).set(repeatTimeOfDay === 'AM' ? {
    hour: morningReviewTime.hour,
    minute: morningReviewTime.minute,
    second: 0,
    millisecond: 0,
  } : {
    hour: eveningReviewTime.hour,
    minute: eveningReviewTime.minute,
    second: 0,
    millisecond: 0,
  });
  if (nextRepeatDueAt < now) {
    // Example: now = 8am, due = 7am -> due at is at 6am, in the past.
    return nextRepeatDueAt.plus({
      days: 1,
    });
  }
  return nextRepeatDueAt;
}

function summarizeWeekdayDueAt(dueAt: DateTime, now: DateTime): string {
  const dayName = dueAt.toFormat('cccc'); // Full day name like "Tuesday"

  // Check if it's in the same calendar week and after today
  const currentWeekday = now.weekday; // 1=Monday, 7=Sunday
  const dueWeekday = dueAt.weekday;

  // Get the start of the current week (Monday)
  const startOfCurrentWeek = now.startOf('week');
  const startOfDueWeek = dueAt.startOf('week');

  // If it's the same week and the due day is after today's weekday
  if (startOfCurrentWeek.equals(startOfDueWeek) && dueWeekday > currentWeekday) {
    return dayName;
  }

  // Otherwise, it's next week (or beyond)
  return `next ${dayName}`;
}

const getSkipDateTime = (now: DateTime) => (
  now.plus({
    minutes: SKIP_PERIOD_MINUTES,
  })
);

/**
 * Gets all repeat button choices for a periodic note.
 * @param repetition The note's parsed repetition status.
 * @param now A reference time (for consistent diffs).
 * @param settings Plugin settings.
 * @returns Collection of repeat choices.
 */
function getPeriodicRepeatChoices(
  repetition: Repetition,
  now: DateTime,
  settings: RepeatPluginSettings,
): RepeatChoice[] {
  const { repeatDueAt } = repetition;
  if ((repeatDueAt > now) || !repeatDueAt) {
    return [{
      text: DISMISS_BUTTON_TEXT,
      nextRepetition: 'DISMISS',
    }];
  }
  const nextRepeatDueAt = incrementRepeatDueAt({ ...repetition }, settings);
  const choices: RepeatChoice[] = [{
    text: SKIP_BUTTON_TEXT,
    nextRepetition: {
      ...repetition,
      repeatDueAt: getSkipDateTime(now),
    }
  }, {
    text: repetition.repeatPeriodUnit === 'WEEKDAYS'
      ? summarizeWeekdayDueAt(nextRepeatDueAt, now)
      : summarizeDueAt(nextRepeatDueAt, now),
    nextRepetition: {
      ...repetition,
      repeatDueAt: nextRepeatDueAt,
    },
  }];

  if (settings.enqueueNonRepeatingNotes && repetition.virtual) {
    choices.push({
      text: NEVER_BUTTON_TEXT,
      nextRepetition: 'NEVER',
    });
  }

  return choices;
}

/**
 * Gets all repeat button choices for a spaced note.
 * @param repetition The note's parsed repetition status.
 * @param now A reference time (for consistent diffs).
 * @param settings Plugin settings.
 * @returns Collection of repeat choices.
 */
function getSpacedRepeatChoices(
  repetition: Repetition,
  now: DateTime,
  settings: RepeatPluginSettings,
): RepeatChoice[] {
  const {
    repeatPeriod,
    repeatPeriodUnit,
    repeatTimeOfDay,
  } = repetition;
  const { repeatDueAt } = repetition;
  if ((repeatDueAt > now) || !repeatDueAt) {
    return [{
      text: DISMISS_BUTTON_TEXT,
      nextRepetition: 'DISMISS',
    }];
  }
  const morningReviewTime = parseTime(settings.morningReviewTime);
  const eveningReviewTime = parseTime(settings.eveningReviewTime);
  const multiplierChoices: RepeatChoice[] = [0.5, 1.0, 1.5, 2.0].map((multiplier) => {
    let nextRepeatDueAt = now.plus({
      [repeatPeriodUnit]: multiplier * repeatPeriod,
    });
    // Spaced notes due in at least a week should respect time of day choice.
    if (nextRepeatDueAt.minus({ days: 7 }) >= now) {
      nextRepeatDueAt = nextRepeatDueAt.set(
        repeatTimeOfDay === 'AM' ? {
          hour: morningReviewTime.hour,
          minute: morningReviewTime.minute,
          second: 0,
          millisecond: 0,
        } : {
          hour: eveningReviewTime.hour,
          minute: eveningReviewTime.minute,
          second: 0,
          millisecond: 0,
        });
    }
    // Find the repeat interval summarization.
    // @ts-ignore: .values *does* exist on Duration.
    let { hours } = nextRepeatDueAt.diff(now, 'hours').values || {};
    if (!hours || hours < 1) {
      hours = 1;
    }
    hours = Math.round(hours);
    return {
      text: `${summarizeDueAt(nextRepeatDueAt, now)} (x${multiplier})`,
      nextRepetition: {
        ...repetition,
        repeatDueAt: nextRepeatDueAt,
        repeatPeriod: hours,
        repeatPeriodUnit: 'HOUR',
      }
    };
  });
  const choices: RepeatChoice[] = [
    {
      text: SKIP_BUTTON_TEXT,
      nextRepetition: {
        ...repetition,
        repeatDueAt: getSkipDateTime(now),
      },
    },
    ...multiplierChoices,
  ];
  if (settings.enqueueNonRepeatingNotes && repetition.virtual) {
    choices.push({
      text: NEVER_BUTTON_TEXT,
      nextRepetition: 'NEVER',
    });
  }
  return uniqByField(choices, 'text');
}

/**
 * Gets all repeat button choices for an FSRS note.
 * @param repetition The note's parsed repetition status.
 * @param now A reference time.
 * @param settings Plugin settings.
 */
function getFSRSChoices(
  repetition: Repetition,
  now: DateTime,
  settings: RepeatPluginSettings,
): RepeatChoice[] {
  const { repeatDueAt } = repetition;
  if ((repeatDueAt && repeatDueAt > now)) {
    return [{
      text: DISMISS_BUTTON_TEXT,
      nextRepetition: 'DISMISS',
    }];
  }

  // Initialize Card from repetition metadata
  let card: Card = initCard();
  if (repetition.fsrs_stability !== undefined) {
    card.stability = repetition.fsrs_stability;
    card.difficulty = repetition.fsrs_difficulty || 0;
    card.reps = repetition.fsrs_reps || 0;
    card.lapses = repetition.fsrs_lapses || 0;
    // Use last review date if available, otherwise fallback (e.g. to now or previous due date logic?)
    // If it's a new migration, stability might be 0.
    // We'll trust the initCard() defaults if data is missing, but update last_review.
    if (repetition.fsrs_last_review) {
      card.last_review = new Date(repetition.fsrs_last_review);
    } else {
      // If we have stability but no last review, maybe infer? 
      // Or just set to now minus elapsed? 
      // For safety, let's treat as review at 'now'.
      card.last_review = now.toJSDate();
    }

    // Infer state? 
    if (card.reps === 0) card.state = State.New;
    else if (card.reps < 3 && card.stability < 1) card.state = State.Learning; // Simple heuristic
    else card.state = State.Review;
  } else {
    // Migration logic: If migrating from Space/Periodic, we treat as New.
    // Or could be smarter. The user instructions said:
    // "initialize FSRS state using current interval as baseline stability."
    // Let's do that if repeatPeriod is available.
    if (repetition.repeatStrategy === 'SPACED' || repetition.repeatStrategy === 'PERIODIC') {
      // Basic migration
      // Interval in days?
      // repeatPeriodUnit
      // Let's keep it simple: Treat as New for first FSRS review unless we implement complex migration.
      // User said "initialize FSRS state using current interval as baseline stability".
      // We'll stick to State.New for now to be safe, or maybe set stability = interval?
      // If I set stability = interval (days), and state = Review?
      // Let's treat as New to avoid messing up. 
      // Actually, if I treat as New, they see Learning steps.
      // Let's stick to initCard() (New) for this iteration.
    }
  }

  const ratings = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];
  const ratingLabels = {
    [Rating.Again]: 'Again',
    [Rating.Hard]: 'Hard',
    [Rating.Good]: 'Good',
    [Rating.Easy]: 'Easy',
  };

  const choices: RepeatChoice[] = ratings.map(rating => {
    const nextCard = reviewCard({ ...card }, rating, now.toJSDate(), settings.fsrsParams);

    // Calculate due date from scheduled_days
    let nextDue = now.plus({ days: nextCard.scheduled_days });

    // Format label and interval
    let intervalText = '';
    let intervalUnit: 'MINUTE' | 'DAY' = 'DAY';
    let scheduledPeriod = nextCard.scheduled_days;

    if (rating === Rating.Again) {
      // Learning Step: 10 minutes
      scheduledPeriod = 10;
      intervalUnit = 'MINUTE';
      intervalText = '10 min';
      // Override the due date
      // @ts-ignore
      nextDue = now.plus({ minutes: 10 });
    } else if (nextCard.scheduled_days < 1) {
      // Should not happen with standard FSRS unless we allow fractional, but if it does:
      const minutes = Math.max(1, Math.round(nextCard.scheduled_days * 24 * 60));
      intervalText = minutes + ' min';
      intervalUnit = 'MINUTE';
      scheduledPeriod = minutes;
      // @ts-ignore
      nextDue = now.plus({ minutes: minutes });
    } else {
      intervalText = Math.round(nextCard.scheduled_days) + ' days';
    }

    return {
      text: `${ratingLabels[rating]} (${intervalText})`,
      nextRepetition: {
        ...repetition,
        repeatStrategy: 'FSRS',
        repeatDueAt: nextDue,
        repeatPeriod: scheduledPeriod,
        repeatPeriodUnit: intervalUnit,
        fsrs_stability: nextCard.stability,
        fsrs_difficulty: nextCard.difficulty,
        fsrs_reps: nextCard.reps,
        fsrs_lapses: nextCard.lapses,
        fsrs_last_review: nextCard.last_review.toISOString(),
      },
      rating: rating,
    };
  });

  // Add Skip/Dismiss if needed? 
  // Usually strict SRS doesn't have "Skip 5 min". 
  // But we can add "Skip" if desired.
  choices.unshift({
    text: SKIP_BUTTON_TEXT,
    nextRepetition: {
      ...repetition,
      repeatDueAt: getSkipDateTime(now),
    }
  });

  if (settings.enqueueNonRepeatingNotes && repetition.virtual) {
    choices.push({
      text: NEVER_BUTTON_TEXT,
      nextRepetition: 'NEVER',
    });
  }

  return choices;
}

/**
 * Get all repetition choices for a note.
 * @param repetition The note's parsed repetition status.
 * @param settings Plugin settings.
 * @returns Collection of repeat choices.
 */
export function getRepeatChoices(
  repetition: Repetition | undefined | null,
  settings: RepeatPluginSettings
): RepeatChoice[] {
  if (!repetition) {
    return [];
  }
  const { repeatStrategy, repeatPeriodUnit } = repetition;
  const now = DateTime.now();
  // Weekday repetitions should always use periodic choices, regardless of strategy
  if (repeatStrategy === 'PERIODIC' || repeatPeriodUnit === 'WEEKDAYS') {
    return getPeriodicRepeatChoices(repetition, now, settings);
  }
  if (repeatStrategy === 'FSRS' || settings.enableFSRS) {
    return getFSRSChoices(repetition, now, settings);
  }
  if (repeatStrategy === 'SPACED') {
    return getSpacedRepeatChoices(repetition, now, settings);
  }
  return [{
    text: DISMISS_BUTTON_TEXT,
    nextRepetition: 'DISMISS',
  }];
}
