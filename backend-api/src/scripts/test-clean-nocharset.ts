import crypto from 'crypto';
import fetch from 'node-fetch';

const IP = '100.77.145.39';
const APP_KEY = '15581689';
const APP_SECRET = 'nB7B9hfAKmPeAng43Nqr';

async function requestArtemis(url: string) {
    const ts = Date.now().toString();
    const signString = [
        'POST',
        '*/*',
        '',
        'application/json',
        '',
        `x-ca-key:${APP_KEY}`,
        `x-ca-timestamp:${ts}`,
        url
    ].join('\n');

    const signature = crypto.createHmac('sha256', APP_SECRET).update(signString, 'utf8').digest('base64');

    const res = await fetch(`https://${IP}${url}`, {
        method: 'POST',
        headers: {
            'Accept': '*/*',
            'Content-Type': 'application/json',
            'X-Ca-Key': APP_KEY,
            'X-Ca-Timestamp': ts,
            'X-Ca-Signature': signature,
            'X-Ca-Signature-Headers': 'x-ca-key,x-ca-timestamp'
        },
        body: JSON.stringify({ pageNo: 1, pageSize: 1 }),
        agent: new (require('https').Agent)({ rejectUnauthorized: false })
    });

    console.log("No charset:", await res.json());
}

requestArtemis('/artemis/api/resource/v1/acsDevice/acsDeviceList');
