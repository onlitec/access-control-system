"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const HikCentralService_1 = require("../services/HikCentralService");
async function main() {
    console.log("Testing HikCentral connection...");
    try {
        const result = await HikCentralService_1.HikCentralService.getAcsDeviceList(1, 10);
        console.log("Device List Success:", JSON.stringify(result, null, 2));
    }
    catch (err) {
        console.error("Device List Error:", err);
    }
}
main();
