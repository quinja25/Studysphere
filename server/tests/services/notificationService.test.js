'use strict';
process.env.NODE_ENV = 'test';

jest.mock('../../models', () => ({
    Notifications: {
        create: jest.fn(),
    },
}));

const { Notifications } = require('../../models');
const { createAndEmit } = require('../../services/notificationService');

const makeIo = () => {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    return { io: { to }, to, emit };
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('notificationService.createAndEmit', () => {
    it('persists the notification with the provided fields', async () => {
        Notifications.create.mockResolvedValue({ id: 1, toJSON: () => ({ id: 1 }) });
        await createAndEmit({
            userId: 7,
            type: 'answer',
            relatedType: 'question',
            relatedId: 42,
            content: 'Someone answered your question',
            link: '/qa?question=42',
        });
        expect(Notifications.create).toHaveBeenCalledWith({
            userId: 7,
            type: 'answer',
            relatedType: 'question',
            relatedId: 42,
            content: 'Someone answered your question',
            link: '/qa?question=42',
        });
    });

    it('emits notification:new to the user-scoped socket room when io is provided', async () => {
        const payload = { id: 11, userId: 99, content: 'Endorsed!' };
        Notifications.create.mockResolvedValue({ ...payload, toJSON: () => payload });
        const { io, to, emit } = makeIo();

        await createAndEmit({
            userId: 99,
            type: 'endorsement',
            content: 'Endorsed!',
        }, io);

        expect(to).toHaveBeenCalledWith('user_99');
        expect(emit).toHaveBeenCalledWith('notification:new', payload);
    });

    it('does not emit when io is omitted (still persists)', async () => {
        Notifications.create.mockResolvedValue({ id: 2, toJSON: () => ({ id: 2 }) });
        await expect(
            createAndEmit({ userId: 3, type: 'answer', content: 'x' })
        ).resolves.toMatchObject({ id: 2 });
        expect(Notifications.create).toHaveBeenCalled();
    });

    it('throws when required fields are missing', async () => {
        await expect(createAndEmit({ type: 'answer', content: 'x' })).rejects.toThrow(/required/);
        await expect(createAndEmit({ userId: 1, content: 'x' })).rejects.toThrow(/required/);
        await expect(createAndEmit({ userId: 1, type: 'answer' })).rejects.toThrow(/required/);
    });

    it('nulls out missing optional fields', async () => {
        Notifications.create.mockResolvedValue({ id: 3, toJSON: () => ({ id: 3 }) });
        await createAndEmit({ userId: 4, type: 'report_actioned', content: 'Review done' });
        expect(Notifications.create).toHaveBeenCalledWith(expect.objectContaining({
            relatedType: null, relatedId: null, link: null,
        }));
    });
});
