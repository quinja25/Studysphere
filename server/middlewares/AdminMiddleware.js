const { Users } = require('../models');

const validateAdmin = async (req, res, next) => {
    try {
        const user = await Users.findByPk(req.user.id);
        if (!user || !user.isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        return next();
    } catch (err) {
        return res.status(500).json({ error: 'Server error checking admin status' });
    }
};

module.exports = { validateAdmin };
