'use strict';
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const SECRET = process.env.JWT_SECRET || 'test-secret-key';

function generateAccessToken(userId, extras = {}) {
  return jwt.sign({ id: userId, type: 'access', ...extras }, SECRET, { expiresIn: '15m' });
}
function generateRefreshToken(userId) {
  return jwt.sign({ id: userId, type: 'refresh' }, SECRET, { expiresIn: '30d' });
}
function generateEmailVerifyToken(userId) {
  return jwt.sign({ id: userId, type: 'email-verify' }, SECRET, { expiresIn: '24h' });
}
function generateResetToken(userId) {
  return jwt.sign({ id: userId, type: 'reset' }, SECRET, { expiresIn: '1h' });
}
async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}
module.exports = { generateAccessToken, generateRefreshToken, generateEmailVerifyToken, generateResetToken, hashPassword };
