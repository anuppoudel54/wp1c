// controllers/adminController.js
const pool = require('../config/dbConfig');
const { createDockerInstance } = require('../utils/dockerUtils');

async function getStats(req, res) {
    try {
        const docker = createDockerInstance();

        // Parallel DB queries for speed
        const [
            [userRows],
            [containerRows],
        ] = await Promise.all([
            pool.execute('SELECT COUNT(*) AS count FROM users'),
            pool.execute('SELECT COUNT(*) AS count FROM containers'),
        ]);

        // Docker system info
        const allDockerContainers = await new Promise((resolve, reject) => {
            docker.listContainers({ all: true }, (err, containers) => {
                if (err) reject(err);
                else resolve(containers || []);
            });
        });

        const running = allDockerContainers.filter(c => c.State === 'running').length;
        const stopped = allDockerContainers.filter(c => c.State === 'exited').length;

        // Docker disk usage (images)
        const images = await new Promise((resolve, reject) => {
            docker.listImages((err, imgs) => {
                if (err) reject(err);
                else resolve(imgs || []);
            });
        });
        const totalImageSize = images.reduce((sum, img) => sum + (img.Size || 0), 0);

        // Docker volumes
        const volumes = await new Promise((resolve, reject) => {
            docker.listVolumes((err, data) => {
                if (err) reject(err);
                else resolve(data?.Volumes || []);
            });
        });
        const wpVolumes = volumes.filter(v => v.Name.startsWith('wp_data_'));

        res.json({
            users: userRows[0].count,
            containers: containerRows[0].count,
            dockerRunning: running,
            dockerStopped: stopped,
            dockerTotal: allDockerContainers.length,
            totalImageSizeMB: Math.round(totalImageSize / 1024 / 1024),
            wpVolumes: wpVolumes.length,
        });
    } catch (error) {
        console.error('Error fetching admin stats:', error);
        res.status(500).json({ message: 'Failed to fetch stats' });
    }
}

async function getAllUsers(req, res) {
    try {
        const [users] = await pool.execute(
            `SELECT u.id, u.username, u.is_admin, u.created_at, 
             COUNT(c.id) AS container_count
             FROM users u 
             LEFT JOIN containers c ON u.id = c.user_id 
             GROUP BY u.id 
             ORDER BY u.created_at DESC`
        );
        res.json({ users });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ message: 'Failed to fetch users' });
    }
}

async function getAllContainers(req, res) {
    try {
        const docker = createDockerInstance();
        const [rows] = await pool.execute(
            `SELECT c.id, c.hostname, c.container_id, c.ports, c.created_at, 
             u.username AS owner
             FROM containers c
             JOIN users u ON c.user_id = u.id
             ORDER BY c.created_at DESC`
        );

        // Batch status lookup
        const allDockerContainers = await new Promise((resolve, reject) => {
            docker.listContainers({ all: true }, (err, containers) => {
                if (err) reject(err);
                else resolve(containers || []);
            });
        });
        const statusMap = {};
        for (const dc of allDockerContainers) {
            statusMap[dc.Id] = dc.State;
        }

        const containersWithStatus = rows.map(row => {
            let status = 'unknown';
            if (row.container_id === 'pending') status = 'pending';
            else if (row.container_id === 'failed') status = 'failed';
            else if (row.container_id) status = statusMap[row.container_id] || 'missing';
            return { ...row, status };
        });

        res.json({ containers: containersWithStatus });
    } catch (error) {
        console.error('Error fetching all containers:', error);
        res.status(500).json({ message: 'Failed to fetch containers' });
    }
}

async function toggleAdmin(req, res) {
    const { id } = req.params;
    try {
        // Don't let admin de-admin themselves
        if (parseInt(id) === req.user.id) {
            return res.status(400).json({ message: 'Cannot change your own admin status' });
        }
        const [rows] = await pool.execute('SELECT is_admin FROM users WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        const newStatus = rows[0].is_admin ? 0 : 1;
        await pool.execute('UPDATE users SET is_admin = ? WHERE id = ?', [newStatus, id]);
        res.json({ message: `User admin status set to ${newStatus ? 'admin' : 'user'}` });
    } catch (error) {
        console.error('Error toggling admin:', error);
        res.status(500).json({ message: 'Failed to toggle admin status' });
    }
}

module.exports = { getStats, getAllUsers, getAllContainers, toggleAdmin };
