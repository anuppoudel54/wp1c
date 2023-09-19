function generateRandomString(length) {
    const charset = "abcdefghijklmnopqrstuvwxyz0123456789";
    let randomString = "";
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * charset.length);
        randomString += charset[randomIndex];
    }
    return randomString;
}

function generateRandomUsername(hostname, length) {
    const prefix = hostname.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    const randomSuffix = generateRandomString(length - prefix.length);
    return prefix + randomSuffix;
}

function generateRandomPassword(length) {
    return generateRandomString(length);
}

module.exports = { generateRandomString, generateRandomUsername, generateRandomPassword };
