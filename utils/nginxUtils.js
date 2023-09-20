// utils/nginxUtils.js
const fs = require('fs');
const path = require('path');


function createNginxConfig(hostname, docker) {
    const nginxTemplate = fs.readFileSync(path.join(__dirname, 'docker-data/nginx/conf.d/template'), 'utf8');
    const nginxConfig = nginxTemplate
        .replace(/HOSTNAME/g, hostname);
    fs.writeFileSync(path.join(__dirname,`docker-data/nginx/conf.d/${hostname}.conf`), nginxConfig);
    
    
    const containerName = 'wp1c_nginx'; // Name of the Nginx container
    const command = ['nginx', '-s', 'reload'];

    docker.getContainer(containerName).exec(
        {
            Cmd: command,
            AttachStdout: true,
            AttachStderr: true,
            Tty: false,
        },
        (err, exec) => {
            if (err) {
                console.error('Error creating exec instance:', err);
                return;
            }

            exec.start((err, stream) => {
                if (err) {
                    console.error('Error starting exec instance:', err);
                    return;
                }

                // Create a writable stream to capture the command's output
                const output = [];
                stream.on('data', (chunk) => {
                    output.push(chunk);
                });
                
             
                stream.on('end', () => {
                    // When the command finishes, inspect the exit code
                    exec.inspect((err, data) => {
                        if (err) {
                            console.error('Error inspecting exec instance:', err);
                            return;
                        }
                        
                        if (data.ExitCode === 0) {
                            console.log('Nginx configuration reloaded successfully.');
                        } else {
                            console.error('Failed to reload Nginx configuration.');
                        }
                    });
                });
            });
        }
    );
    
    


    
    
}

module.exports = { createNginxConfig };
