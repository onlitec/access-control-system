import { HikCentralService } from '../services/HikCentralService';

async function main() {
    console.log("Testing HikCentral connection...");
    try {
        const result = await HikCentralService.getAcsDeviceList(1, 10);
        console.log("Device List Success:", JSON.stringify(result, null, 2));
    } catch (err) {
        console.error("Device List Error:", err);
    }
}

main();
