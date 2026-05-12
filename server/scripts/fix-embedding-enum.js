require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../models');

async function main() {
    await db.sequelize.authenticate();

    await db.sequelize.query(`
        ALTER TABLE ContentEmbeddings
        MODIFY COLUMN sourceType ENUM('wiki','question','answer','resource','post','document','global_document') NOT NULL
    `);
    console.log('ContentEmbeddings.sourceType ENUM updated.');
    await db.sequelize.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
