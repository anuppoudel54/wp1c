const pool = require('../config/dbConfig');
const { generateRandomUsername, generateRandomPassword } = require('../utils/randomUtils');
const { createDatabaseAndUserForInstance, deleteDatabaseAndUserForInstance } = require('../services/databaseService');
const { createNginxConfig, deleteNginxConfig } = require('../utils/nginxUtils');
const { createDockerInstance, checkDockerImageExists, pullDockerImage } = require('../utils/dockerUtils');

const dbUserLength = 12;
const passLength = 12;

async function createContainer(req, res) {
    const { hostname } = req.body;
    const imageName = 'wordpress:latest';
    const userId = req.user.id;

    try {
        const checkHostnameQuery = 'SELECT COUNT(*) AS count FROM containers WHERE hostname = ?';
        const hostnameExists = await checkHostnameExists(checkHostnameQuery, hostname);

        if (hostnameExists) {
            console.log('Hostname already exists.', hostname);
            return res.status(400).json({ message: 'Hostname already exists.' });
        }
        
        // Insert initial pending record
        const insertQuery = 'INSERT INTO containers (user_id, hostname, container_id, ports, created_at) VALUES (?, ?, ?, ?, NOW())';
        const [insertResult] = await pool.execute(insertQuery, [userId, hostname, 'pending', '']);
        const recordId = insertResult.insertId;

        // Respond immediately
        res.status(202).json({ message: 'Request submitted. Container is being created in the background.' });

        // Run background task
        runBackgroundCreation(hostname, imageName, recordId).catch(err => {
            console.error('Background creation failed:', err);
        });

    } catch (error) {
        console.error(`Error initiating container creation: ${error}`);
        res.status(500).json({ message: 'Failed to initiate container creation.' });
    }
}

async function runBackgroundCreation(hostname, imageName, recordId) {
    const dbUsername = generateRandomUsername(hostname, dbUserLength);
    const dbPassword = generateRandomPassword(passLength);
    const databaseName = `${hostname}_db`;
    
    try {
        const docker = createDockerInstance();
        
        const databaseAndUserForInstance = await createDatabaseAndUserForInstance(databaseName, dbUsername, dbPassword);
        if(!databaseAndUserForInstance) throw new Error('Failed to create DB/User');

        const imageExists = await checkDockerImageExists(docker, imageName);
        if (!imageExists) {
            await pullDockerImage(docker, imageName);
        }

        const container = await createDockerContainer(docker, imageName, hostname, databaseName, dbUsername, dbPassword);

        if (container) {
            const ports = await getContainerPortDetails(container);
            await pool.execute('UPDATE containers SET container_id = ?, ports = ? WHERE id = ?', [container.id, ports, recordId]);
            createNginxConfig(hostname, docker);
            console.log('Background container created successfully', { containerId: container.id, ports });
        } else {
            throw new Error('Docker container creation returned null');
        }
    } catch (error) {
        console.error(`Background task error for ${hostname}:`, error);
        await pool.execute('UPDATE containers SET container_id = ?, ports = ? WHERE id = ?', ['failed', '', recordId]);
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
        HostConfig: {
            NetworkMode: 'wp1c_wp',
        },
        Env: [
            `WORDPRESS_DB_NAME=${databaseName}`,
            `WORDPRESS_DB_USER=${dbUsername}`,
            `WORDPRESS_DB_PASSWORD=${dbPassword}`,
            `WORDPRESS_DB_HOST=${process.env.DB_HOST}`,
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

async function getMyContainers(req, res) {
    try {
        const userId = req.user.id;
        const [rows] = await pool.execute('SELECT id, hostname, container_id, ports, created_at FROM containers WHERE user_id = ? ORDER BY created_at DESC', [userId]);
        res.json({ containers: rows });
    } catch (error) {
        console.error('Error fetching containers:', error);
        res.status(500).json({ message: 'Failed to fetch containers' });
    }
}

async function deleteContainer(req, res) {
    const { id } = req.params;
    const userId = req.user.id;
    try {
        const [rows] = await pool.execute('SELECT * FROM containers WHERE id = ? AND user_id = ?', [id, userId]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Container not found or unauthorized' });
        }
        const containerRecord = rows[0];
        const docker = createDockerInstance();
        
        // Always delete Nginx config
        deleteNginxConfig(containerRecord.hostname, docker);
        
        // Always try to drop the database, since we know its name format
        const dbName = `${containerRecord.hostname}_db`;
        await deleteDatabaseAndUserForInstance(dbName, null);
        
        // Remove from docker and drop user if it has a real ID
        if (containerRecord.container_id && containerRecord.container_id !== 'pending' && containerRecord.container_id !== 'failed') {
            const container = docker.getContainer(containerRecord.container_id);
            try {
                // Inspect container to find database user
                const info = await new Promise((resolve, reject) => {
                    container.inspect((err, data) => err ? reject(err) : resolve(data));
                });
                
                const env = info.Config.Env || [];
                let dbUser = null;
                for (const e of env) {
                    if (e.startsWith('WORDPRESS_DB_USER=')) dbUser = e.split('=')[1];
                }
                
                await container.stop();
                await container.remove();
                
                if (dbUser) {
                    await deleteDatabaseAndUserForInstance(null, dbUser);
                }
            } catch (err) {
                console.error('Error stopping/removing docker container or dropping user:', err);
            }
        }
        
        // Remove from database
        await pool.execute('DELETE FROM containers WHERE id = ?', [id]);
        
        res.status(200).json({ message: 'Container deleted successfully' });
    } catch (error) {
        console.error('Error deleting container:', error);
        res.status(500).json({ message: 'Failed to delete container' });
    }
}

module.exports = { createContainer, getMyContainers, deleteContainer };
