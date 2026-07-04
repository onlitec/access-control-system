"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
function generateSignature(method, path, headers, appSecret) {
    let stringToSign = method.toUpperCase() + '\n';
    stringToSign += (headers['Accept'] || headers['accept'] || '') + '\n';
    stringToSign += (headers['Content-MD5'] || headers['content-md5'] || '') + '\n';
    stringToSign += (headers['Content-Type'] || headers['content-type'] || '') + '\n';
    stringToSign += (headers['Date'] || headers['date'] || '') + '\n';
    const xCaHeadersKeys = Object.keys(headers)
        .filter(key => key.toLowerCase().startsWith('x-ca-') &&
        key.toLowerCase() !== 'x-ca-signature' &&
        key.toLowerCase() !== 'x-ca-signature-headers')
        .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    if (xCaHeadersKeys.length > 0) {
        stringToSign += xCaHeadersKeys.map(key => `${key.toLowerCase()}:${headers[key]}`).join('\n');
        stringToSign += '\n';
    }
    stringToSign += path;
    return crypto_1.default
        .createHmac('sha256', appSecret)
        .update(stringToSign, 'utf8')
        .digest('base64');
}
const apiUrl = 'https://100.77.145.39';
const appKey = '15581689';
const appSecret = 'pA9wh6Y2chcm5wUBe49O';
const path = '/artemis/api/resource/v1/org/orgList';
const timestamp = Date.now().toString();
const dateStr = new Date().toUTCString();
const body = JSON.stringify({ pageNo: 1, pageSize: 1 });
const headers = {
    'Accept': '*/*',
    'Content-Type': 'application/json',
    'Date': dateStr,
    'X-Ca-Key': appKey,
    'X-Ca-Timestamp': timestamp,
    'X-Ca-Signature-Headers': 'x-ca-key,x-ca-timestamp',
    'Content-MD5': crypto_1.default.createHash('md5').update(body, 'utf8').digest('base64')
};
const signature = generateSignature('POST', path, headers, appSecret);
let curlCmd = `curl -k -X POST "${apiUrl}${path}" \\\n`;
for (const [key, value] of Object.entries(headers)) {
    curlCmd += `  -H "${key}: ${value}" \\\n`;
}
curlCmd += `  -H "X-Ca-Signature: ${signature}" \\\n`;
curlCmd += `  -d '${body}'`;
console.log(curlCmd);
