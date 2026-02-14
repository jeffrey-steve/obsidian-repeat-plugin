export interface FSRSParameters {
    request_retention: number;
    maximum_interval: number;
    w: number[];
}

export const default_request_retention = 0.9;
export const default_maximum_interval = 36500;
export const default_w = [
    0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61, 0.09, 0.03
];

export const default_parameters: FSRSParameters = {
    request_retention: default_request_retention,
    maximum_interval: default_maximum_interval,
    w: default_w,
};

export interface Card {
    due: Date;
    stability: number;
    difficulty: number;
    elapsed_days: number;
    scheduled_days: number;
    reps: number;
    lapses: number;
    state: State;
    last_review: Date;
}

export enum State {
    New = 0,
    Learning = 1,
    Review = 2,
    Relearning = 3,
}

export enum Rating {
    Again = 1,
    Hard = 2,
    Good = 3,
    Easy = 4,
}

export interface FSRSItem {
    card: Card;
}

export function initCard(): Card {
    return {
        due: new Date(),
        stability: 0,
        difficulty: 0,
        elapsed_days: 0,
        scheduled_days: 0,
        reps: 0,
        lapses: 0,
        state: State.New,
        last_review: new Date(),
    };
}

export function reviewCard(
    card: Card,
    rating: Rating,
    review_time: Date = new Date(),
    params: FSRSParameters = default_parameters,
): Card {
    const { w } = params;
    let { stability, difficulty, state, reps, lapses } = card;
    const last_review = card.last_review || review_time;

    // Calculate elapsed days since last review
    const interval_ms = review_time.getTime() - last_review.getTime();
    const elapsed_days = Math.max(0, interval_ms / (1000 * 60 * 60 * 24));

    // Power law retrievability: R = (1 + (19/81) * t/S)^-0.5
    const retrievability = stability > 0
        ? Math.pow(1 + (19 / 81) * elapsed_days / stability, -0.5)
        : 0;

    if (state === State.New) {
        difficulty = w[4] - (rating - 3) * w[5];
        difficulty = Math.max(1, Math.min(10, difficulty));

        switch (rating) {
            case Rating.Again:
                stability = w[0];
                state = State.Learning;
                break;
            case Rating.Hard:
                stability = w[1];
                state = State.Learning;
                break;
            case Rating.Good:
                stability = w[2];
                state = State.Review;
                break;
            case Rating.Easy:
                stability = w[3];
                state = State.Review;
                break;
        }
    } else if (state === State.Learning || state === State.Relearning) {
        // Simple learning handling, similar to FSRS v4 logic for short term
        // However, standard FSRS handles learning steps differently.
        // Here we'll simplify and transition to Review if Good/Easy
        if (rating === Rating.Again) {
            stability = w[0];
            // Maintain learning state
        } else if (rating === Rating.Hard) {
            stability = w[1];
        } else if (rating === Rating.Good) {
            stability = w[2];
            state = State.Review;
        } else if (rating === Rating.Easy) {
            stability = w[3];
            state = State.Review;
        }
    } else if (state === State.Review) {
        if (elapsed_days === 0) {
            // Same-day review (v5)
            stability = stability * Math.exp(w[17] * (rating - 3 + w[18]));
        } else {
            // Standard Review Logic
            // Difficulty update with mean reversion
            const next_difficulty = difficulty - w[6] * (rating - 3);
            difficulty = w[7] * w[4] + (1 - w[7]) * next_difficulty;
            difficulty = Math.max(1, Math.min(10, difficulty));

            if (rating === Rating.Again) {
                // Forget
                stability = w[11] * Math.pow(difficulty, -w[12]) * (Math.pow(stability + 1, w[13]) - 1) * Math.exp(w[14] * (1 - retrievability));
                state = State.Relearning;
                lapses += 1;
            } else {
                // Success
                const hard_penalty = (rating === Rating.Hard) ? w[15] : 1.0;
                const easy_bonus = (rating === Rating.Easy) ? w[16] : 1.0;
                const weight = hard_penalty * easy_bonus;

                const growth = Math.exp(w[8]) * (11 - difficulty) * Math.pow(stability, -w[9]) * (Math.exp(w[10] * (1 - retrievability)) - 1);
                stability = stability * (1 + growth * weight);
            }
        }
    }

    if (rating === Rating.Again) {
        reps = 0;
    } else {
        reps += 1;
    }

    // Interval Calculation using Power Law Inversion
    let interval = 0;
    if (stability > 0) {
        // I = S * (81/19) * (R^-2 - 1)
        interval = stability * (81 / 19) * (Math.pow(params.request_retention, -2) - 1);
    }

    // Constraint: Max Interval
    interval = Math.min(Math.max(1, Math.round(interval)), params.maximum_interval);

    // For Again, we often want very short. 
    if (rating === Rating.Again) {
        interval = 0; // Immediate/Soon. In day-based systems, this usually means "Today" or "Tomorrow".
        // The original plugin supports minutes.
    }

    // Logic for next due date
    let due = new Date(review_time.getTime());
    if (interval < 1) {
        // Less than a day?
        // If it's 0 (Again), maybe set to 5 minutes or 1 day?
        // In typical Anki/FSRS, Again is a learning step (e.g. 1min, 10min).
        // Here we'll rely on the caller to handle sub-day "Again" if needed, 
        // but for the 'due' field we need a Date.
        // The calling code handles "Minutes" skips. 
        // We will return the calculated interval in days.
    }

    // We return the updated card. The due date calculation happens outside or we attach it.
    // Let's adhere to "nextInterval" function for pure interval, "reviewCard" for state update.

    return {
        ...card,
        stability,
        difficulty,
        reps,
        lapses,
        state,
        last_review: review_time,
        scheduled_days: interval,
        elapsed_days
    };
}

export function nextInterval(card: Card, params: FSRSParameters = default_parameters): number {
    const { stability } = card;
    if (stability <= 0) return 0;
    const { request_retention, maximum_interval } = params;
    const interval = stability * (81 / 19) * (Math.pow(request_retention, -2) - 1);
    return Math.min(Math.max(1, Math.round(interval)), maximum_interval);
}
