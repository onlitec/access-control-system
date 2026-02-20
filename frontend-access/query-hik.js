const crypto = require('crypto');
const axios = require('axios');

const HIK_CONFIG = {
    ip: '100.77.145.39',
    appKey: '26269542',
    appSecret: 'AYmE6LIQrwJC81Rv1c6J'
};

function createCompatibleSignature(method, path, secret) {
    const signString = `${method.toUpperCase()}\n*/*\n\napplication/json;charset=UTF-8\n\nx-ca-key:${HIK_CONFIG.appKey}\n${path}`;
    return crypto.createHmac('sha256', secret).update(signString).digest('base64');
}

async function queryAppointments() {
    const path = '/artemis/api/visitor/v2/appointment/history'; // Try history
    const url = `https://${HIK_CONFIG.ip}${path}`;
    const headers = {
        'Accept': '*/*',
        'Content-Type': 'application/json;charset=UTF-8',
        'x-ca-key': HIK_CONFIG.appKey,
        'x-ca-signature-headers': 'x-ca-key'
    };

    headers['x-ca-signature'] = createCompatibleSignature('POST', path, HIK_CONFIG.appSecret);

    try {
        console.log(`[QUERY] POST ${path}`);
        const response = await axios.post(url, { pageNo: 1, pageSize: 10 }, {
            headers,
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
            timeout: 5000
        });
        console.log(JSON.stringify(response.data, null, 2));
    } catch (e) {
        console.log(`[ERR] ${e.message}`);
    }
}

queryAppointments();
