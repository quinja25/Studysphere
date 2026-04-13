'use strict';

/**
 * testDb.js — creates a fresh Sequelize instance backed by SQLite in-memory.
 *
 * Used only by integration tests. The reason this exists separately from
 * models/index.js is that index.js is cached by Node's require cache and
 * reads config from env vars (pointing at MySQL). We need a completely
 * independent Sequelize instance to avoid conflicts with the unit test mocks.
 */

const path = require('path');
const fs = require('fs');
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false,
});

const db = {};

// Load every model definition file from the models directory
const modelsDir = path.join(__dirname, '../../models');
fs.readdirSync(modelsDir)
    .filter(f => f.endsWith('.js') && f !== 'index.js' && !f.includes('.test.'))
    .forEach(file => {
        const modelDef = require(path.join(modelsDir, file));
        if (typeof modelDef === 'function') {
            try {
                const model = modelDef(sequelize, Sequelize.DataTypes);
                db[model.name] = model;
            } catch {
                // Some model files may export non-model functions; skip them
            }
        }
    });

// Wire associations (same as models/index.js)
Object.keys(db).forEach(name => {
    if (db[name] && typeof db[name].associate === 'function') {
        db[name].associate(db);
    }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
