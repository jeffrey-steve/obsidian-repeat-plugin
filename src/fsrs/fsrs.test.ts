import { initCard, reviewCard, nextInterval, State, Rating, default_parameters, Card } from './fsrs';

const default_w_2 = default_parameters.w[2];

describe('FSRS Logic', () => {
    const now = new Date('2023-10-27T10:00:00Z');
    const testParams = { ...default_parameters, enable_fuzzing: false };

    test('initCard returns correct default state', () => {
        const card = initCard();
        expect(card.state).toBe(State.New);
        expect(card.stability).toBe(0);
        expect(card.difficulty).toBe(0);
        expect(card.reps).toBe(0);
        expect(card.lapses).toBe(0);
    });

    it('initial stability', () => {
        let card = initCard();
        card = reviewCard(card, Rating.Good, new Date(), testParams);
        expect(card.stability).toBeCloseTo(default_w_2);
        expect(card.state).toBe(State.Review);
    });

    test('First review (New -> Learning/Review)', () => {
        let card = initCard();

        // New -> Good should be Review
        const cardGood = reviewCard({ ...card }, Rating.Good, now, testParams);
        expect(cardGood.state).toBe(State.Review);
        expect(cardGood.stability).toBeGreaterThan(0);
        expect(cardGood.scheduled_days).toBeGreaterThan(0);

        const cardAgain = reviewCard({ ...card }, Rating.Again, now, testParams);
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
        const cardGood = reviewCard({ ...card }, Rating.Good, now, testParams);
        expect(cardGood.state).toBe(State.Review);
        expect(cardGood.stability).toBeGreaterThan(card.stability); // Stability should increase
        expect(cardGood.reps).toBe(card.reps + 1);

        // Rating Again (Lapse)
        const cardAgain = reviewCard({ ...card }, Rating.Again, now, testParams);
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
        const interval = nextInterval(card, testParams);

        // Interval = stability * 9 * (1/0.9 - 1) = stability * 9 * (1.11 - 1) = stability * 9 * 0.11 = stability * 1 approx.
        const expected = 10 * (81 / 19) * (Math.pow(0.9, -2) - 1);

        expect(interval).toBeCloseTo(expected, 0);
    });

    test('Max interval constraint', () => {
        const card: Card = {
            ...initCard(),
            state: State.Review,
            stability: 100000,
            difficulty: 5,
        };
        const params = { ...default_parameters, maximum_interval: 365, enable_fuzzing: false };
        const interval = nextInterval(card, params);
        expect(interval).toBe(365);
    });
});
