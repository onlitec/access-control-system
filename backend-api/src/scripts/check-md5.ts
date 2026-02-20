import { HikCentralService } from '../services/HikCentralService';

async function main() {
    console.log("Testing with MD5 generation...");
    try {
        const bodyObj = { pageNo: 1, pageSize: 2 };
        const bodyStr = JSON.stringify(bodyObj);
        const md5 = require('crypto').createHash('md5').update(bodyStr, 'utf8').digest('base64');
        
        const result = await HikCentralService.hikRequest('/artemis/api/resource/v1/acsDevice/acsDeviceList', {
            method: 'POST',
            headers: {
                'Content-MD5': md5
            },
            body: bodyStr,
        });
        console.log("Result:", JSON.stringify(result, null, 2));
    } catch (err) {
        console.error("Error:", err);
    }
}

main();
