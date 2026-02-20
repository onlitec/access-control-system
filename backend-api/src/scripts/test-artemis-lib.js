const Artemis = require('artemis-http-client');

async function run() {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    try {
        const client = new Artemis.Client('26269542', 'wVkq6TjwrEP3BTL5iPi1');

        console.log("Calling...");
        const result = await client.post('https://100.77.145.39/artemis/api/resource/v1/acsDevice/acsDeviceList', {
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
