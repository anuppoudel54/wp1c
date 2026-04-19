const crypto = require('crypto');

function generateRandomString(length) {
    const charset = "abcdefghijklmnopqrstuvwxyz0123456789";
    const bytes = crypto.randomBytes(length);
    let randomString = "";
    for (let i = 0; i < length; i++) {
        randomString += charset[bytes[i] % charset.length];
    }
    return randomString;
}

function generateRandomUsername(hostname, length) {
    const prefix = hostname.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    const randomSuffix = generateRandomString(length - prefix.length);
    return prefix + randomSuffix;
}

function generateRandomPassword(length) {
    return crypto.randomBytes(length).toString('base64url').slice(0, length);
}

module.exports = { generateRandomString, generateRandomUsername, generateRandomPassword };
