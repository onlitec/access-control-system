const Artemis = require('artemis-http-client');

async function run() {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    try {
        const client = new Artemis.Client('15581689', 'nB7B9hfAKmPeAng43Nqr');

        console.log("Calling...");
        const result = await client.post('https://100.77.145.39/artemis/api/resource/v1/acsDevice/acsDeviceList',
            { pageNo: 1, pageSize: 1 },
            {
                headers: {
                    'content-type': 'application/json;charset=UTF-8',
                    'accept': '*/*'
                }
            }
        );

        console.log("Success:", result);
    } catch (err) {
        if (err.response) {
            console.error(err.response);
        } else {
            console.error("Error:", err);
        }
    }
}
run();
