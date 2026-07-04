"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const HikCentralService_1 = require("./services/HikCentralService");
async function main() {
    console.log("--- TRAP TEST ---");
    try {
        const buffer = await HikCentralService_1.HikCentralService.captureCameraPicture("2");
        console.log("DONE:", buffer.length);
    }
    catch (e) {
        console.log("ERR:", e.message);
    }
}
main();
