import crypto from 'crypto';
import fetch from 'node-fetch';

const HIK_IP = '100.77.145.39';
const BASE_URL = `https://${HIK_IP}`;
const APP_KEY = '26269542';
const APP_SECRET = 'AYmE6LIQrwJC81Rv1c6J';

async function testAuth(contentType: string) {
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
        .createHmac('sha256', APP_SECRET)
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
    console.log(`Test with ${contentType} -> ${data.code}: ${data.msg}`);
}

async function run() {
    await testAuth('application/json');
    await testAuth('application/json;charset=UTF-8');
    await testAuth('*/*');
}

run();
