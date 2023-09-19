// utils/nginxUtils.js
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function createNginxConfig(hostname) {
    const nginxTemplate = fs.readFileSync(path.join(__dirname, 'docker-data/nginx/conf.d/template'), 'utf8');
    const nginxConfig = nginxTemplate
        .replace(/HOSTNAME/g, hostname);
    fs.writeFileSync(path.join(__dirname,`docker-data/nginx/conf.d/${hostname}.conf`), nginxConfig);

    // Reload Nginx to apply the new configuration (requires elevated permissions)
    const nginxReloadProcess = spawn('docker', ['restart', 'nginx']);

    nginxReloadProcess.on('close', (code) => {
        if (code === 0) {
            console.log('Nginx configuration reloaded successfully.');
        } else {
            console.error('Error reloading Nginx configuration.');
        }
    });
}

module.exports = { createNginxConfig };
