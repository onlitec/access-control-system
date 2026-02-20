import crypto from 'crypto';
import fetch from 'node-fetch';

const IP = '100.77.145.39';
const APP_KEY = '26269542';
const APP_SECRET = 'wVkq6TjwrEP3BTL5iPi1';

async function testPath(pathInSig: string, urlPath: string) {
    const ts = Date.now().toString();
    const headers = {
        'Accept': '*/*',
        'Content-Type': 'application/json;charset=UTF-8',
        'X-Ca-Key': APP_KEY,
        'X-Ca-Timestamp': ts,
        'X-Ca-Signature-Headers': 'x-ca-key,x-ca-timestamp'
    };

    const signString = [
        'POST',
        '*/*',
        '',
        'application/json;charset=UTF-8',
        '',
        `x-ca-key:${APP_KEY}`,
        `x-ca-timestamp:${ts}`,
        pathInSig
    ].join('\n');

    const signature = crypto.createHmac('sha256', APP_SECRET).update(signString, 'utf8').digest('base64');

    const sendHeaders = {
        ...headers,
        'X-Ca-Signature': signature
    };

    const res = await fetch(`https://${IP}${urlPath}`, {
        method: 'POST',
        headers: sendHeaders,
        body: JSON.stringify({ pageNo: 1, pageSize: 1 }),
        agent: new (require('https').Agent)({ rejectUnauthorized: false })
    });

    console.log(`Path in Sig: ${pathInSig} =>`, await res.json());
}

async function run() {
    await testPath('/artemis/api/resource/v1/acsDevice/acsDeviceList', '/artemis/api/resource/v1/acsDevice/acsDeviceList');
    await testPath('/api/resource/v1/acsDevice/acsDeviceList', '/artemis/api/resource/v1/acsDevice/acsDeviceList');
    await testPath('/api/resource/v1/acsDevice/acsDeviceList', '/api/resource/v1/acsDevice/acsDeviceList');
}
run();
