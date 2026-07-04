"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const HikCentralService_1 = require("./HikCentralService");
async function test() {
    console.log("--- FORCE CAPTURE TEST ---");
    try {
        const buffer = await HikCentralService_1.HikCentralService.captureCameraPicture("2");
        console.log("SUCCESS! Len:", buffer.length);
    }
    catch (e) {
        console.log("FAIL:", e.message);
    }
}
test();
