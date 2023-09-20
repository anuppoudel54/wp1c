// services/databaseService.js
const pool = require('../config/dbConfig');

async function createDatabaseAndUserForInstance(databaseName, username, password) {
    try {
        // Create a new database
        const createDbQuery = `CREATE DATABASE ${databaseName};`;
        await pool.query(createDbQuery);

        console.log(`Database ${databaseName} created successfully.`);

        // Create a new user
        const createUserQuery = `CREATE USER '${username}'@'%' IDENTIFIED BY '${password}';`;
        await pool.query(createUserQuery);

        console.log(`User ${username} created successfully.`);

        // Grant privileges to the user
        const grantPrivilegesQuery = `GRANT ALL PRIVILEGES ON ${databaseName}.* TO '${username}'@'%';`;
        await pool.query(grantPrivilegesQuery);

        console.log(`Privileges granted to user ${username} on ${databaseName}.`);
        return true;
    } catch (error) {
        console.error(`Error creating database or user: ${error}`);
    }}

module.exports = { createDatabaseAndUserForInstance };
