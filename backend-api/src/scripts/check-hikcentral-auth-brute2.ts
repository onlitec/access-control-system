import crypto from 'crypto';
import fetch from 'node-fetch';

const HIK_IP = '100.77.145.39';
const BASE_URL = `https://${HIK_IP}`;
const APP_KEY = '26269542';

async function testAuth(appSecret: string) {
    const path = '/artemis/api/resource/v1/org/orgList';
    const method = 'POST';
    const timestamp = Date.now().toString();

    const headers: Record<string, string> = {
        'Accept': '*/* ', // space? no
        'Content-Type': 'application/json;charset=UTF-8',
        'X-Ca-Key': APP_KEY,
        'X-Ca-Timestamp': timestamp,
        'X-Ca-Signature-Headers': 'x-ca-key,x-ca-timestamp',
    };
    headers['Accept'] = '*/*';

    const lf = '\n';
    let stringToSign = method.toUpperCase() + lf;
    stringToSign += (headers['Accept'] || '') + lf;
    stringToSign += (headers['Content-MD5'] || '') + lf;
    stringToSign += (headers['Content-Type'] || '') + lf;
    stringToSign += (headers['Date'] || '') + lf;

    const xCaHeaders = Object.keys(headers)
        .filter(key => key.toLowerCase().startsWith('x-ca-') && key.toLowerCase() !== 'x-ca-signature')
        .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
        .map(key => `${key.toLowerCase()}:${headers[key]}`)
        .join(lf);

    if (xCaHeaders) {
        stringToSign += xCaHeaders + lf;
    }
    stringToSign += path;

    const signature = crypto
        .createHmac('sha256', appSecret)
        .update(stringToSign, 'utf8')
        .digest('base64');
    headers['X-Ca-Signature'] = signature;

    const url = `${BASE_URL}${path}`;

    const response = await fetch(url, {
        method,
        headers,
        body: JSON.stringify({ pageNo: 1, pageSize: 1 }),
        // @ts-ignore
        agent: new (require('https').Agent)({ rejectUnauthorized: false })
    });

    return (await response.json()).code === '0';
}

async function run() {
    let base = "AYmE6LIQrwJC81Rv1c6J";
    let arr = [
        "AYmE6LIQrwJC81Rv1C6J",
        "AYME6LIQrwJC81Rv1c6J",
        "AYmE6LIQRwJC81Rv1c6J",
        "aYmE6LIQrwJC81Rv1c6J",
        "AYmE6LlQrwJC81Rv1c6J"
    ];

    for (let s of arr) {
        if (await testAuth(s)) {
            console.log("FOUND: " + s);
            return;
        }
    }
    console.log("Not found in batch 2.");
}
run();
