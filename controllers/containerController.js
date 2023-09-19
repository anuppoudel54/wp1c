// controllers/containerController.js
const pool = require('../config/dbConfig');
const { generateRandomUsername, generateRandomPassword } = require('../utils/randomUtils');
const { createDatabaseAndUserForInstance } = require('../services/databaseService');
const { createNginxConfig } = require('../utils/nginxUtils');
const { spawn } = require('child_process');
const dbUserLength=12
const passLength=12
async function createContainer(req, res) {
    const { hostname } = req.body;
    const imageName = 'wordpress'; 

    // Validate the hostname
    const checkHostnameQuery = 'SELECT COUNT(*) AS count FROM containers WHERE hostname = ?';

    try {
        const [hostnameExistsResult] = await pool.execute(checkHostnameQuery, [hostname]);
        const hostnameExists = hostnameExistsResult[0].count > 0;

        if (hostnameExists) {
            console.log('Hostname already exists.', hostname)
            return res.status(400).json({ message: 'Hostname already exists.' });
        }

        const dbUsername = generateRandomUsername(hostname, dbUserLength);
        const dbPassword = generateRandomPassword(passLength);
        const databaseName = `${hostname}_db`;
        await createDatabaseAndUserForInstance(databaseName, dbUsername, dbPassword);

        // Check if the Docker image exists locally.
        const dockerImageCheckProcess = spawn('docker', ['images', '--format', '{{.Repository}}:{{.Tag}}']);

        dockerImageCheckProcess.stdout.on('data', (data) => {
            const images = data.toString().split('\n');
            if (images.includes(imageName)) {
                createContainer();
            } else {
                pullImage();
            }
        });

        dockerImageCheckProcess.stderr.on('data', (data) => {
            console.error(`Error checking for Docker image: ${data}`);
            res.status(500).json({ message: 'Failed to check for Docker image.' });
        });

        function pullImage() {
            // Command to pull the Docker image.
            const dockerPullProcess = spawn('docker', ['pull', imageName]);

            dockerPullProcess.on('close', (code) => {
                if (code === 0) {
                    console.log(`Image ${imageName} pulled successfully.`);
                    createContainer();
                } else {
                    console.error(`Error pulling Docker image: ${imageName}`);
                    res.status(500).json({ message: `Failed to pull Docker image: ${imageName}` });
                }
            });
        }

        function createContainer() {
            // Command to create a Docker container with a specific host port.
            const dockerCreateProcess = spawn('docker', [
                'run',
                '-d',
                '--name',
                hostname,
                '--network',
                'wp1c_wp',
                '--env',
                `WORDPRESS_DB_NAME=${databaseName}`,
                '--env',
                `WORDPRESS_DB_USER=${dbUsername}`,
                '--env',
                `WORDPRESS_DB_PASSWORD=${dbPassword}`,
                '--env',
                `WORDPRESS_DB_HOST=${process.env.NEW_DB_HOST}`,
                imageName
            ]);
            dockerCreateProcess.stdout.on('data', async (data) => {
                const containerId = data.toString().trim();

                // Get the allocated port for the container.
                const dockerInspectProcess = spawn('docker', ['inspect', '--format', '{{json .NetworkSettings.Ports}}', containerId]);

                dockerInspectProcess.stdout.on('data', async (portData) => {
                    const portInfo = JSON.parse(portData.toString());

                    const portDetails = [];

                    for (const key in portInfo) {
                        const [port, protocol] = key.split('/');
                        portDetails.push(`${port}/${protocol}`);
                    }

                    const combinedPorts = portDetails.join(',');
                    createNginxConfig(hostname);

                    // Insert container information into the database
                    const query = 'INSERT INTO containers (hostname, container_id, ports, created_at) VALUES (?, ?, ?, NOW())';
                    const values = [hostname, containerId, combinedPorts];

                    await pool.execute(query, values);

                    console.log('Container created successfully', { containerId, portDetails });
                    res.status(200).json({ message: 'Container created successfully.', portDetails ,containerId});
                });

                dockerInspectProcess.stderr.on('data', (inspectError) => {
                    console.error(`Error inspecting Docker container: ${inspectError}`);
                    res.status(500).json({ message: 'Failed to inspect the Docker container.' });
                });
            });

            dockerCreateProcess.stderr.on('data', (createError) => {
                console.error(`Error creating container: ${createError}`);
                res.status(500).json({ message: 'Failed to create the Docker container.' });
            });
        }
    } catch (error) {
        console.error(`Error creating container or inserting into the database: ${error}`);
        res.status(500).json({ message: 'Failed to create container or record data.' });
    }
}

module.exports = { createContainer };
