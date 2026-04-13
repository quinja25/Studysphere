'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Fetch all groups that have no leader assigned
    const [groups] = await queryInterface.sequelize.query(
      "SELECT id FROM `Groups` WHERE leader IS NULL OR leader = ''"
    );

    for (const group of groups) {
      // 2. Find a user associated with this group (from the join table)
      const [users] = await queryInterface.sequelize.query(
        `SELECT UserId FROM \`Groups_Users\` WHERE GroupId = ${group.id} LIMIT 1`
      );

      if (users.length > 0) {
        const leaderId = users[0].UserId;
        // 3. Update the group with the found user as leader
        await queryInterface.sequelize.query(
          `UPDATE \`Groups\` SET leader = '${leaderId}' WHERE id = ${group.id}`
        );
      }
    }
  },

  down: async (queryInterface, Sequelize) => {
    // No rollback needed for data backfill
  }
};