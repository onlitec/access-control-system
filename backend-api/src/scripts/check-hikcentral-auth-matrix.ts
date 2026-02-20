import crypto from 'crypto';
import fetch from 'node-fetch';

const HIK_IP = '100.77.145.39';
const BASE_URL = `https://${HIK_IP}`;
const APP_KEY = '26269542';
const APP_SECRET = 'wVkq6TjwrEP3BTL5iPi1';

async function testAuth(includeSigHeaders: boolean, sortAllXCa: boolean, lowercaseKeysInString: boolean) {
    const path = '/artemis/api/resource/v1/acsDevice/acsDeviceList';
    const method = 'POST';
    const timestamp = Date.now().toString();

    const headers: Record<string, string> = {
        'Accept': '*/*',
        'Content-Type': 'application/json;charset=UTF-8',
        'X-Ca-Key': APP_KEY,
        'X-Ca-Timestamp': timestamp,
    };
    if (includeSigHeaders) {
        headers['X-Ca-Signature-Headers'] = 'x-ca-key,x-ca-timestamp';
    }

    const lf = '\n';
    let stringToSign = method.toUpperCase() + lf;
    stringToSign += (headers['Accept'] || '') + lf;
    stringToSign += (headers['Content-MD5'] || '') + lf;
    stringToSign += (headers['Content-Type'] || '') + lf;
    stringToSign += (headers['Date'] || '') + lf;

    const keysToInclude = sortAllXCa 
        ? Object.keys(headers).filter(k => k.toLowerCase().startsWith('x-ca-'))
        : ['X-Ca-Key', 'X-Ca-Timestamp'];

    keysToInclude.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    const xCaString = keysToInclude.map(k => {
        const keyName = lowercaseKeysInString ? k.toLowerCase() : k;
        return `${keyName}:${headers[k]}`;
    }).join(lf);

    if (xCaString) {
        stringToSign += xCaString + lf;
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
        body: JSON.stringify({ pageNo: 1, pageSize: 1 }),
        // @ts-ignore
        agent: new (require('https').Agent)({ rejectUnauthorized: false })
    });

    const data = await response.json();
    return { stringToSign: stringToSign.replace(/\n/g, '\\n'), code: data.code, msg: data.msg };
}

async function run() {
    console.log("Test 1: Include SigHeaders=true, SortAll=true, Lowercase=true");
    console.log(await testAuth(true, true, true));

    console.log("\nTest 2: Include SigHeaders=false, SortAll=true, Lowercase=true");
    console.log(await testAuth(false, true, true));

    console.log("\nTest 3: Include SigHeaders=true, SortAll=false, Lowercase=true");
    console.log(await testAuth(true, false, true));

    console.log("\nTest 4: Include SigHeaders=false, SortAll=true, Lowercase=false");
    console.log(await testAuth(false, true, false));
    
    // Also test with empty string for Content-Type? Or no Accept?
}
run();
