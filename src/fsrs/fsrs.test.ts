import { initCard, reviewCard, nextInterval, State, Rating, default_parameters, Card } from './fsrs';

describe('FSRS Logic', () => {
    const now = new Date('2023-10-27T10:00:00Z');

    test('initCard returns correct default state', () => {
        const card = initCard();
        expect(card.state).toBe(State.New);
        expect(card.stability).toBe(0);
        expect(card.difficulty).toBe(0);
        expect(card.reps).toBe(0);
        expect(card.lapses).toBe(0);
    });

    test('First review (New -> Learning/Review)', () => {
        let card = initCard();

        // Rating Good on New card -> Review
        // Wait, in my implementation:
        // New -> Again = Learning
        // New -> Hard = Learning
        // New -> Good = Review
        // New -> Easy = Review
        // (Based on w[0]..w[3])

        const cardGood = reviewCard({ ...card }, Rating.Good, now);
        expect(cardGood.state).toBe(State.Review);
        expect(cardGood.stability).toBeGreaterThan(0);
        expect(cardGood.scheduled_days).toBeGreaterThan(0);

        const cardAgain = reviewCard({ ...card }, Rating.Again, now);
        expect(cardAgain.state).toBe(State.Learning);
        expect(cardAgain.stability).toBeLessThan(1); // Usually short for Again
    });

    test('Review state updates', () => {
        // Manually create a review card
        let card: Card = {
            due: now,
            stability: 5,
            difficulty: 5,
            elapsed_days: 5,
            scheduled_days: 5,
            reps: 1,
            lapses: 0,
            state: State.Review,
            last_review: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
        };

        // Rating Good
        const cardGood = reviewCard({ ...card }, Rating.Good, now);
        expect(cardGood.state).toBe(State.Review);
        expect(cardGood.stability).toBeGreaterThan(card.stability); // Stability should increase
        expect(cardGood.reps).toBe(card.reps + 1);

        // Rating Again (Lapse)
        const cardAgain = reviewCard({ ...card }, Rating.Again, now);
        expect(cardAgain.state).toBe(State.Relearning);
        expect(cardAgain.lapses).toBe(card.lapses + 1);
        expect(cardAgain.stability).toBeLessThan(card.stability); // Stability should decrease implies forgetting
    });

    test('Interval calculation', () => {
        const card: Card = {
            ...initCard(),
            state: State.Review,
            stability: 10,
            difficulty: 5,
        };
        const params = default_parameters;
        const interval = nextInterval(card, params);

        // Interval = stability * 9 * (1/0.9 - 1) = stability * 9 * (1.11 - 1) = stability * 9 * 0.11 = stability * 1 approx.
        // retention 0.9 -> multiplier 1.0

        const expected = 10 * (81 / 19) * (Math.pow(0.9, -2) - 1);
        // 10 * (81/19) * (0.23456...) approx 10.

        expect(interval).toBeCloseTo(expected, 0);
    });

    test('Max interval constraint', () => {
        const card: Card = {
            ...initCard(),
            state: State.Review,
            stability: 100000,
            difficulty: 5,
        };
        const params = { ...default_parameters, maximum_interval: 365 };
        const interval = nextInterval(card, params);
        expect(interval).toBe(365);
    });
});
