const pool = require('../config/dbConfig');
const { generateRandomUsername, generateRandomPassword } = require('../utils/randomUtils');
const { createDatabaseAndUserForInstance } = require('../services/databaseService');
const { createNginxConfig } = require('../utils/nginxUtils');
const { createDockerInstance, checkDockerImageExists, pullDockerImage } = require('../utils/dockerUtils');

const dbUserLength = 12;
const passLength = 12;

async function createContainer(req, res) {
    const { hostname } = req.body;
    const imageName = 'wordpress';

    try {
        const docker = createDockerInstance();
        const checkHostnameQuery = 'SELECT COUNT(*) AS count FROM containers WHERE hostname = ?';
        const dbUsername = generateRandomUsername(hostname, dbUserLength);
        const dbPassword = generateRandomPassword(passLength);
        const databaseName = `${hostname}_db`;

        const hostnameExists = await checkHostnameExists(checkHostnameQuery, hostname);

        if (hostnameExists) {
            console.log('Hostname already exists.', hostname);
            return res.status(400).json({ message: 'Hostname already exists.' });
        }
       
        const databaseAndUserForInstance = await createDatabaseAndUserForInstance(databaseName, dbUsername, dbPassword);
        if(!databaseAndUserForInstance){
            return res.status(500).json({ message: 'Failed to create database and user.' });
        }

        const imageExists = await checkDockerImageExists(docker, imageName);

        if (!imageExists) {
            await pullDockerImage(docker, imageName);
        }

        const container = await createDockerContainer(docker, imageName, hostname, databaseName, dbUsername, dbPassword);

        if (container) {
            const ports = await getContainerPortDetails(container);
            const query = 'INSERT INTO containers (hostname, container_id, ports, created_at) VALUES (?, ?, ?, NOW())';
            const values = [hostname, container.id, ports];
            await pool.execute(query, values);
            createNginxConfig(hostname,docker);
       
            console.log('Container created successfully', { containerId: container.id, ports });
            res.status(200).json({ message: 'Container created successfully.', ports, containerId: container.id });
        } else {
            return res.status(500).json({ message: 'Failed to create the Docker container.' });
        }
    } catch (error) {
        console.error(`Error creating container or inserting into the database: ${error}`);
        res.status(500).json({ message: 'Failed to create container or record data.' });
    }
}

async function checkHostnameExists(query, hostname) {
    const [hostnameExistsResult] = await pool.execute(query, [hostname]);
    return hostnameExistsResult[0].count > 0;
}

async function createDockerContainer(docker, imageName, hostname, databaseName, dbUsername, dbPassword) {
    // Create a Docker container with specific options.
    const containerOptions = {
        Image: imageName,
        name: hostname,
        NetworkMode: 'wp1c_wp',
        Env: [
            `WORDPRESS_DB_NAME=${databaseName}`,
            `WORDPRESS_DB_USER=${dbUsername}`,
            `WORDPRESS_DB_PASSWORD=${dbPassword}`,
            `WORDPRESS_DB_HOST=${process.env.NEW_DB_HOST}`,
        ],
    };

    return new Promise((resolve, reject) => {
        docker.createContainer(containerOptions, async (err, container) => {
            if (err) {
                console.error('Error creating container:', err);
                reject(err);
            }

            container.start(async (err) => {
                if (err) {
                    console.error('Error starting container:', err);
                    reject(err);
                }
                    resolve(container);
                
            });
        });
    });
}

async function getContainerPortDetails(container) {
    return new Promise((resolve, reject) => {
        container.inspect((err, containerInfo) => {
            if (err) {
                console.error('Error inspecting Docker container:', err);
                reject(err);
            }

            const portDetails = (Object.keys(containerInfo.NetworkSettings.Ports)).join(',');
            resolve(portDetails);
        });
    });
}

module.exports = { createContainer };
