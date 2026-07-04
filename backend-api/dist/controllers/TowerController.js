"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TowerController = void 0;
const BaseController_1 = require("./BaseController");
const db_1 = require("../db");
class TowerController extends BaseController_1.BaseController {
    constructor() {
        super(...arguments);
        /**
         * GET /api/towers/active
         * Retorna a lista de torres ativas
         */
        this.getActiveTowers = async (req, res) => {
            try {
                const towers = await db_1.prisma.tower.findMany({
                    where: { isActive: true },
                    orderBy: { name: 'asc' }
                });
                return res.json(towers);
            }
            catch (error) {
                console.error('[TowerController] Error fetching active towers:', error);
                return this.error(res, error.message);
            }
        };
    }
}
exports.TowerController = TowerController;
