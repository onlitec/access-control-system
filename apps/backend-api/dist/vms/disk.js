"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDiskInfo = getDiskInfo;
exports.isDiskCritical = isDiskCritical;
const fs_1 = require("fs");
const config_1 = require("./config");
const GB = 1024 * 1024 * 1024;
/** Espaço livre no volume das gravações (null se o SO não informar). */
async function getDiskInfo(dir = config_1.VMS_RECORDINGS_DIR) {
    try {
        const st = await fs_1.promises.statfs(dir);
        const freeBytes = Number(st.bavail) * Number(st.bsize);
        const totalBytes = Number(st.blocks) * Number(st.bsize);
        return { freeBytes, totalBytes, freeGb: freeBytes / GB };
    }
    catch {
        return null;
    }
}
/**
 * Disco criticamente cheio: abaixo de METADE do mínimo configurado nem a
 * limpeza dá conta — a gravação precisa parar até haver espaço.
 */
async function isDiskCritical() {
    const info = await getDiskInfo();
    if (!info)
        return false; // sem informação, não bloqueia a gravação
    return info.freeGb < config_1.VMS_MIN_FREE_GB / 2;
}
