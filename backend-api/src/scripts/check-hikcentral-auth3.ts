import crypto from 'crypto';
import fetch from 'node-fetch';

const HIK_IP = '100.77.145.39';
const BASE_URL = `https://${HIK_IP}`;
const APP_KEY = '26269542';

async function testAuth(appSecret: string, contentType: string) {
    const path = '/artemis/api/resource/v1/org/orgList';
    const method = 'POST';
    const timestamp = Date.now().toString();

    const headers: Record<string, string> = {
        'Accept': '*/*',
        'Content-Type': contentType,
        'X-Ca-Key': APP_KEY,
        'X-Ca-Timestamp': timestamp,
        'X-Ca-Signature-Headers': 'x-ca-key,x-ca-timestamp',
    };

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
        body: JSON.stringify({ pageNo: 1, pageSize: 10 }),
        // @ts-ignore
        agent: new (require('https').Agent)({ rejectUnauthorized: false })
    });

    const data = await response.json();
    return data;
}

async function run() {
    console.log("Testing with application/json");
    console.log(await testAuth('AYmE6LIQrwJC81Rv1c6J', 'application/json'));
    console.log("Testing with application/json;charset=utf-8");
    console.log(await testAuth('AYmE6LIQrwJC81Rv1c6J', 'application/json;charset=utf-8'));
    console.log("Testing with application/json; charset=utf-8");
    console.log(await testAuth('AYmE6LIQrwJC81Rv1c6J', 'application/json; charset=utf-8'));
}
run();
