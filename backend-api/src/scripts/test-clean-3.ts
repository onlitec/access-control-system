import crypto from 'crypto';
import fetch from 'node-fetch';

const IP = '100.77.145.39';
const APP_KEY = '15581689';
const APP_SECRET = 'nB7B9hfAKmPeAng43Nqr';

async function testFormat(testName: string, headersConfig: Record<string, string>) {
    const ts = Date.now().toString();
    const signString = [
        'POST',
        '*/*',
        '',
        'application/json;charset=UTF-8',
        '',
        `x-ca-key:${APP_KEY}`,
        `x-ca-timestamp:${ts}`,
        '/artemis/api/resource/v1/acsDevice/acsDeviceList'
    ].join('\n');

    const signature = crypto.createHmac('sha256', APP_SECRET).update(signString, 'utf8').digest('base64');

    // Inject signature
    headersConfig['x-ca-signature'] = signature;
    if (headersConfig['X-Ca-Signature']) headersConfig['X-Ca-Signature'] = signature;

    // Inject TS
    if (headersConfig['x-ca-timestamp']) headersConfig['x-ca-timestamp'] = ts;
    if (headersConfig['X-Ca-Timestamp']) headersConfig['X-Ca-Timestamp'] = ts;

    const res = await fetch(`https://${IP}/artemis/api/resource/v1/acsDevice/acsDeviceList`, {
        method: 'POST',
        headers: headersConfig,
        body: JSON.stringify({ pageNo: 1, pageSize: 1 }),
        agent: new (require('https').Agent)({ rejectUnauthorized: false })
    });

    console.log(`${testName} =>`, await res.json());
}

async function run() {
    await testFormat('ALL_LOWERCASE', {
        'accept': '*/*',
        'content-type': 'application/json;charset=UTF-8',
        'x-ca-key': APP_KEY,
        'x-ca-timestamp': '0'
    });

    await testFormat('MIXED_CASE', {
        'Accept': '*/*',
        'Content-Type': 'application/json;charset=UTF-8',
        'X-Ca-Key': APP_KEY,
        'X-Ca-Timestamp': '0'
    });

    await testFormat('UPPER_CASE_X', {
        'Accept': '*/*',
        'Content-Type': 'application/json;charset=UTF-8',
        'X-CA-KEY': APP_KEY,
        'X-CA-TIMESTAMP': '0'
    });
}
run();
