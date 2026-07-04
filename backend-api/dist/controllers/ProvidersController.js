"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProvidersController = void 0;
const BaseController_1 = require("./BaseController");
const HikCentralService_1 = require("../services/HikCentralService");
const unifiedConfig_1 = require("../config/unifiedConfig");
class ProvidersController extends BaseController_1.BaseController {
    constructor() {
        super(...arguments);
        this.getProviders = async (req, res) => {
            try {
                const groupName = unifiedConfig_1.config.HIKCENTRAL.VISITOR_GROUP_NAME_PRESTADORES;
                const providers = await HikCentralService_1.HikCentralService.fetchVisitorsWithStatus(groupName);
                const serialized = providers.map(v => ({
                    id: v.appointmentId || v.visitorId,
                    visitor_id: v.visitorId,
                    visitor_name: v.visitorName,
                    visitor_group_name: v.visitorGroupName,
                    plate_no: v.plateNo || '',
                    certificate_no: v.certificateNo || '',
                    phone_num: v.phoneNum || '',
                    appoint_status: v.appointStatus,
                    appoint_status_text: v.appointStatusText,
                    appoint_start_time: v.appointStartTime,
                    appoint_end_time: v.appointEndTime,
                    visit_start_time: v.visitStartTime || null,
                    visit_end_time: v.visitEndTime || null,
                }));
                return this.success(res, serialized);
            }
            catch (error) {
                console.error('[ProvidersController] Error fetching providers:', error);
                return this.error(res, error.message);
            }
        };
    }
}
exports.ProvidersController = ProvidersController;
