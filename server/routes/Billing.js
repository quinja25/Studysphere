const express = require('express');
const router = express.Router();
const { validateToken } = require('../middlewares/AuthMiddleware');
const db = require('../models');

const getStripe = () => {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not set');
    return require('stripe')(process.env.STRIPE_SECRET_KEY);
};

// POST /billing/checkout
// Creates a Stripe Checkout session and returns the redirect URL.
// Body: { plan: 'monthly' | 'yearly' }
router.post('/checkout', validateToken, async (req, res) => {
    const { plan = 'monthly' } = req.body;
    const userId = req.user.id;

    const priceId = plan === 'yearly'
        ? process.env.STRIPE_PRICE_YEARLY
        : process.env.STRIPE_PRICE_MONTHLY;

    if (!priceId) return res.status(500).json({ error: `STRIPE_PRICE_${plan.toUpperCase()} not configured` });

    try {
        const stripe = getStripe();
        const user = await db.Users.findByPk(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        let customerId = user.stripeCustomerId;
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: user.email,
                name: user.name,
                metadata: { userId: String(userId) },
            });
            customerId = customer.id;
            await user.update({ stripeCustomerId: customerId });
        }

        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            payment_method_types: ['card'],
            line_items: [{ price: priceId, quantity: 1 }],
            mode: 'subscription',
            allow_promotion_codes: true,
            success_url: `${process.env.CLIENT_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.CLIENT_URL}/dashboard`,
            metadata: { userId: String(userId) },
        });

        res.json({ url: session.url });
    } catch (err) {
        console.error('Billing checkout error:', err.message);
        res.status(500).json({ error: 'Failed to create checkout session' });
    }
});

// POST /billing/portal
// Opens the Stripe customer portal for managing/cancelling subscriptions.
router.post('/portal', validateToken, async (req, res) => {
    const userId = req.user.id;
    try {
        const stripe = getStripe();
        const user = await db.Users.findByPk(userId);
        if (!user?.stripeCustomerId) {
            return res.status(400).json({ error: 'No billing account found' });
        }

        const session = await stripe.billingPortal.sessions.create({
            customer: user.stripeCustomerId,
            return_url: `${process.env.CLIENT_URL}/dashboard`,
        });

        res.json({ url: session.url });
    } catch (err) {
        console.error('Billing portal error:', err.message);
        res.status(500).json({ error: 'Failed to open billing portal' });
    }
});

// GET /billing/status
// Returns the current Pro status for the logged-in user.
router.get('/status', validateToken, async (req, res) => {
    try {
        const user = await db.Users.findByPk(req.user.id, {
            attributes: ['isPro', 'proExpiresAt'],
        });
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ isPro: user.isPro, proExpiresAt: user.proExpiresAt });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch billing status' });
    }
});

// POST /billing/webhook  (raw body — registered before express.json in server.js)
router.post('/webhook', async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        const stripe = getStripe();
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error('Webhook signature error:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                const userId = parseInt(session.metadata?.userId);
                if (!userId) break;
                const stripe = getStripe();
                const sub = await stripe.subscriptions.retrieve(session.subscription);
                await db.Users.update(
                    { isPro: true, proExpiresAt: new Date(sub.current_period_end * 1000) },
                    { where: { id: userId } }
                );
                break;
            }

            case 'invoice.payment_succeeded': {
                const invoice = event.data.object;
                if (!invoice.subscription) break;
                const stripe = getStripe();
                const sub = await stripe.subscriptions.retrieve(invoice.subscription);
                await db.Users.update(
                    { isPro: true, proExpiresAt: new Date(sub.current_period_end * 1000) },
                    { where: { stripeCustomerId: invoice.customer } }
                );
                break;
            }

            case 'customer.subscription.deleted':
            case 'customer.subscription.paused': {
                const sub = event.data.object;
                await db.Users.update(
                    { isPro: false, proExpiresAt: null },
                    { where: { stripeCustomerId: sub.customer } }
                );
                break;
            }

            case 'invoice.payment_failed': {
                // Log only — don't revoke Pro immediately; Stripe will retry
                console.warn('Payment failed for customer:', event.data.object.customer);
                break;
            }
        }

        res.json({ received: true });
    } catch (err) {
        console.error('Webhook handler error:', err.message);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

module.exports = router;
