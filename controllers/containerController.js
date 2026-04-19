const pool = require('../config/dbConfig');
const { generateRandomUsername, generateRandomPassword } = require('../utils/randomUtils');
const { createDatabaseAndUserForInstance, deleteDatabaseAndUserForInstance } = require('../services/databaseService');
const { createNginxConfig, deleteNginxConfig } = require('../utils/nginxUtils');
const { createDockerInstance, checkDockerImageExists, pullDockerImage, execCommand } = require('../utils/dockerUtils');

const dbUserLength = 12;
const passLength = 12;

async function createContainer(req, res) {
    const { hostname } = req.body;
    
    // Strict backend validation to prevent path traversal and injection
    if (!hostname || typeof hostname !== 'string' || !/^[a-z0-9-]+$/.test(hostname)) {
        return res.status(400).json({ message: 'Invalid hostname. Only lowercase alphanumeric characters and hyphens are allowed.' });
    }
    
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
    const wpAdminPassword = generateRandomPassword(16);
    
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
            
            // Wait for DB and Apache to initialize
            console.log(`Waiting 15 seconds for ${hostname} to initialize...`);
            await new Promise(r => setTimeout(r, 15000));
            
            // Install WP-CLI and run auto-install
            console.log(`Running auto-install for ${hostname}...`);
            await execCommand(container, ['sh', '-c', 'curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar && chmod +x wp-cli.phar && mv wp-cli.phar /usr/local/bin/wp']);
            
            await execCommand(container, [
                'wp', 'core', 'install',
                `--url=http://${hostname}.wp.local`,
                `--title=${hostname}`,
                '--admin_user=admin',
                `--admin_password=${wpAdminPassword}`,
                `--admin_email=admin@${hostname}.wp.local`,
                '--allow-root'
            ]);
            
            await pool.execute('UPDATE containers SET container_id = ?, ports = ?, wp_admin_password = ? WHERE id = ?', [container.id, ports, wpAdminPassword, recordId]);
            createNginxConfig(hostname, docker);
            console.log('Background container created and installed successfully', { containerId: container.id, ports });
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
            Binds: [`wp_data_${hostname}:/var/www/html/wp-content`]
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
        const [rows] = await pool.execute('SELECT id, hostname, container_id, ports, wp_admin_password, created_at FROM containers WHERE user_id = ? ORDER BY created_at DESC', [userId]);
        
        const docker = createDockerInstance();
        
        // Fetch all containers from docker in a single request for performance
        const allDockerContainers = await new Promise((resolve, reject) => {
            docker.listContainers({ all: true }, (err, containers) => {
                if (err) reject(err);
                else resolve(containers || []);
            });
        });
        
        // Create a lookup map for instant status resolution
        const statusMap = {};
        for (const dc of allDockerContainers) {
            statusMap[dc.Id] = dc.State;
        }
        
        // Map live status to our database rows
        const containersWithStatus = rows.map((row) => {
            let status = 'unknown';
            if (row.container_id === 'pending') {
                status = 'pending';
            } else if (row.container_id === 'failed') {
                status = 'failed';
            } else if (row.container_id) {
                // Docker listContainers usually returns a 64 char ID, matching our DB
                // If it's missing from the map, it was deleted manually from docker
                status = statusMap[row.container_id] || 'missing';
            }
            return { ...row, status };
        });
        
        res.json({ containers: containersWithStatus });
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
                
                try {
                    await container.stop();
                } catch (stopErr) {
                    // Ignore error if already stopped (304 Not Modified)
                }
                await container.remove();
                
                if (dbUser) {
                    await deleteDatabaseAndUserForInstance(null, dbUser);
                }
                
                // Remove the named volume to completely clean up storage
                try {
                    const volume = docker.getVolume(`wp_data_${containerRecord.hostname}`);
                    await volume.remove();
                } catch (volErr) {
                    console.error('Error removing volume:', volErr);
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

async function stopContainer(req, res) {
    const { id } = req.params;
    const userId = req.user.id;
    try {
        const [rows] = await pool.execute('SELECT container_id FROM containers WHERE id = ? AND user_id = ?', [id, userId]);
        if (rows.length === 0 || !rows[0].container_id || rows[0].container_id === 'pending' || rows[0].container_id === 'failed') {
            return res.status(404).json({ message: 'Container not found or cannot be stopped' });
        }
        
        const docker = createDockerInstance();
        const container = docker.getContainer(rows[0].container_id);
        await container.stop();
        res.json({ message: 'Container stopped successfully' });
    } catch (error) {
        console.error('Error stopping container:', error);
        res.status(500).json({ message: 'Failed to stop container' });
    }
}

async function startContainer(req, res) {
    const { id } = req.params;
    const userId = req.user.id;
    try {
        const [rows] = await pool.execute('SELECT container_id FROM containers WHERE id = ? AND user_id = ?', [id, userId]);
        if (rows.length === 0 || !rows[0].container_id || rows[0].container_id === 'pending' || rows[0].container_id === 'failed') {
            return res.status(404).json({ message: 'Container not found or cannot be started' });
        }
        
        const docker = createDockerInstance();
        const container = docker.getContainer(rows[0].container_id);
        await container.start();
        res.json({ message: 'Container started successfully' });
    } catch (error) {
        console.error('Error starting container:', error);
        res.status(500).json({ message: 'Failed to start container' });
    }
}

async function dismissPassword(req, res) {
    const { id } = req.params;
    const userId = req.user.id;
    try {
        const [result] = await pool.execute('UPDATE containers SET wp_admin_password = NULL WHERE id = ? AND user_id = ?', [id, userId]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Container not found or unauthorized' });
        }
        res.json({ message: 'Password dismissed successfully' });
    } catch (error) {
        console.error('Error dismissing password:', error);
        res.status(500).json({ message: 'Failed to dismiss password' });
    }
}

module.exports = { createContainer, getMyContainers, deleteContainer, stopContainer, startContainer, dismissPassword };
