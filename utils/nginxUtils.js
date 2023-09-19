// utils/nginxUtils.js
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { stdout } = require('process');

function createNginxConfig(hostname) {
    const nginxTemplate = fs.readFileSync(path.join(__dirname, 'docker-data/nginx/conf.d/template'), 'utf8');
    const nginxConfig = nginxTemplate
        .replace(/HOSTNAME/g, hostname);
    fs.writeFileSync(path.join(__dirname,`docker-data/nginx/conf.d/${hostname}.conf`), nginxConfig);

    const nginxReloadProcess = spawn('docker', ['exec', 'wp1c_nginx', 'nginx', '-s', 'reload']);
    
    
    nginxReloadProcess.on('close', (code) => {
        if (code === 0) {
            console.log('Nginx configuration reloaded successfully.');
        } else {
            console.error('Error reloading Nginx configuration.');
        }
    });
}

module.exports = { createNginxConfig };
