// dockerUtils.js
const Docker = require('dockerode');

function createDockerInstance() {
    // Create and return a Dockerode instance
    return new Docker({ socketPath: process.env.DOCKER_SOCKET_PATH });
}

async function checkDockerImageExists(docker, imageName) {
    return new Promise((resolve, reject) => {
        docker.listImages((err, images) => {
            if (err) {
                reject(err);
            } else {
                const imageExists = images.some((image) => image.RepoTags?.includes(imageName));
                resolve(imageExists);
            }
        });
    });
}

async function pullDockerImage(docker, imageName) {
    return new Promise((resolve, reject) => {
        docker.pull(imageName, (err, stream) => {
            if (err) {
                reject(err);
            } else {
                docker.modem.followProgress(stream, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            }
        });
    });
}

async function execCommand(container, cmdArray) {
    return new Promise(async (resolve, reject) => {
        try {
            const exec = await container.exec({
                Cmd: cmdArray,
                AttachStdout: true,
                AttachStderr: true,
                Tty: false
            });
            
            exec.start(async (err, stream) => {
                if (err) return reject(err);
                
                let output = '';
                stream.on('data', chunk => output += chunk.toString());
                
                stream.on('end', async () => {
                    const data = await exec.inspect();
                    if (data.ExitCode !== 0) {
                        reject(new Error(`Command failed with code ${data.ExitCode}: ${output}`));
                    } else {
                        resolve(output);
                    }
                });
            });
        } catch (error) {
            reject(error);
        }
    });
}

// Export the Docker utilities
module.exports = {
    createDockerInstance,
    checkDockerImageExists,
    pullDockerImage,
    execCommand
};
