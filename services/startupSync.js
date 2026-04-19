// services/startupSync.js
// Recovers from server crashes by reconciling pending DB records with actual Docker state on startup.

const pool = require('../config/dbConfig');
const { generateRandomPassword } = require('../utils/randomUtils');
const { createDockerInstance, execCommand } = require('../utils/dockerUtils');
const { createNginxConfig } = require('../utils/nginxUtils');

const MAX_RETRY_WAIT_MS = 10000;

async function reconcilePendingContainers() {
    console.log('[StartupSync] Scanning for stale pending containers...');

    try {
        const [pendingRows] = await pool.execute(
            "SELECT id, hostname, container_id FROM containers WHERE container_id = 'pending'"
        );

        if (pendingRows.length === 0) {
            console.log('[StartupSync] No pending containers found. All clean.');
            return;
        }

        console.log(`[StartupSync] Found ${pendingRows.length} pending record(s). Reconciling...`);

        const docker = createDockerInstance();

        // Get all docker containers in one batch
        const allDockerContainers = await new Promise((resolve, reject) => {
            docker.listContainers({ all: true }, (err, containers) => {
                if (err) reject(err);
                else resolve(containers || []);
            });
        });

        // Build a lookup by container name (Docker prefixes names with '/')
        const nameMap = {};
        for (const dc of allDockerContainers) {
            for (const name of dc.Names) {
                nameMap[name.replace(/^\//, '')] = dc;
            }
        }

        for (const row of pendingRows) {
            const { id, hostname } = row;
            const dockerInfo = nameMap[hostname];

            if (dockerInfo && dockerInfo.State === 'running') {
                // The Docker container exists and is running — the server must have crashed
                // after creating the container but before finalizing the DB record.
                // Attempt to complete the WP-CLI install and finalize.
                console.log(`[StartupSync] Container "${hostname}" is running. Attempting to finalize...`);
                await finalizeExistingContainer(docker, dockerInfo, id, hostname);
            } else if (dockerInfo) {
                // Container exists but is not running (exited, dead, etc.)
                console.log(`[StartupSync] Container "${hostname}" exists but is ${dockerInfo.State}. Marking as failed.`);
                await pool.execute("UPDATE containers SET container_id = 'failed' WHERE id = ?", [id]);
            } else {
                // No Docker container at all — the crash happened before Docker creation
                console.log(`[StartupSync] No Docker container found for "${hostname}". Marking as failed.`);
                await pool.execute("UPDATE containers SET container_id = 'failed' WHERE id = ?", [id]);
            }
        }

        console.log('[StartupSync] Reconciliation complete.');
    } catch (error) {
        console.error('[StartupSync] Error during reconciliation:', error);
    }
}

async function finalizeExistingContainer(docker, dockerInfo, recordId, hostname) {
    try {
        const container = docker.getContainer(dockerInfo.Id);
        const wpAdminPassword = generateRandomPassword(16);

        // Check if WordPress is already installed by testing wp-cli
        let alreadyInstalled = false;
        try {
            const output = await execCommand(container, [
                'wp', 'core', 'is-installed', '--allow-root'
            ]);
            alreadyInstalled = true;
        } catch (e) {
            // wp-cli not found or WP not installed — we need to install
            alreadyInstalled = false;
        }

        if (!alreadyInstalled) {
            console.log(`[StartupSync] WordPress not yet installed on "${hostname}". Running auto-install...`);

            // Give the container a moment to fully initialize
            await new Promise(r => setTimeout(r, MAX_RETRY_WAIT_MS));

            // Install WP-CLI
            try {
                await execCommand(container, ['sh', '-c', 'which wp || (curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar && chmod +x wp-cli.phar && mv wp-cli.phar /usr/local/bin/wp)']);
            } catch (e) {
                console.error(`[StartupSync] Failed to install WP-CLI for "${hostname}":`, e.message);
            }

            await execCommand(container, [
                'wp', 'core', 'install',
                `--url=http://${hostname}.wp.local`,
                `--title=${hostname}`,
                '--admin_user=admin',
                `--admin_password=${wpAdminPassword}`,
                `--admin_email=admin@${hostname}.wp.local`,
                '--allow-root'
            ]);
        } else {
            console.log(`[StartupSync] WordPress already installed on "${hostname}". Skipping install.`);
        }

        // Get port details
        const info = await new Promise((resolve, reject) => {
            container.inspect((err, data) => err ? reject(err) : resolve(data));
        });
        const ports = Object.keys(info.NetworkSettings.Ports || {}).join(',');

        // Finalize the DB record
        await pool.execute(
            'UPDATE containers SET container_id = ?, ports = ?, wp_admin_password = ? WHERE id = ?',
            [dockerInfo.Id, ports, alreadyInstalled ? null : wpAdminPassword, recordId]
        );

        // Ensure nginx config exists
        createNginxConfig(hostname, docker);

        console.log(`[StartupSync] Successfully finalized "${hostname}" (container: ${dockerInfo.Id.substring(0, 12)})`);
    } catch (error) {
        console.error(`[StartupSync] Failed to finalize "${hostname}":`, error);
        await pool.execute("UPDATE containers SET container_id = 'failed' WHERE id = ?", [recordId]);
    }
}

module.exports = { reconcilePendingContainers };
