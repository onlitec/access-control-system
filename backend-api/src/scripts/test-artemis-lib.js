require('dotenv').config();
const Artemis = require('artemis-http-client');

async function run() {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    try {
        const client = new Artemis.Client(
            process.env.HIKCENTRAL_APP_KEY || '26269542', 
            process.env.HIKCENTRAL_APP_SECRET || 'wVkq6TjwrEP3BTL5iPi1'
        );

        console.log("Calling...");
        const hikIp = process.env.HIKCENTRAL_IP_BASE || '172.20.120.20';
        const result = await client.post(`https://${hikIp}/artemis/api/resource/v1/acsDevice/acsDeviceList`, {
            data: JSON.stringify({ pageNo: 1, pageSize: 1 }),
            headers: {
                'content-type': 'application/json;charset=UTF-8',
                'accept': '*/*'
            },
            timeout: 10000
        });

        console.log("Success:", result);
    } catch (err) {
        console.error("Error:", err.message);
    }
}
run();
