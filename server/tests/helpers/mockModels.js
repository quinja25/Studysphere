'use strict';
function createMockModel(overrides = {}) {
  return {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findByPk: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 1, ...overrides }),
    update: jest.fn().mockResolvedValue([1]),
    destroy: jest.fn().mockResolvedValue(1),
    bulkCreate: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    sum: jest.fn().mockResolvedValue(0),
    ...overrides,
  };
}
module.exports = { createMockModel };
