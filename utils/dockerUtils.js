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
                const imageExists = images.some((image) => image.RepoTags.includes(imageName));
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

// Export the Docker utilities
module.exports = {
    createDockerInstance,
    checkDockerImageExists,
    pullDockerImage,
};
