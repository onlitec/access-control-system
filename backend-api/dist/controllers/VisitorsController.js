"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VisitorsController = void 0;
const BaseController_1 = require("./BaseController");
const HikCentralService_1 = require("../services/HikCentralService");
const unifiedConfig_1 = require("../config/unifiedConfig");
class VisitorsController extends BaseController_1.BaseController {
    constructor() {
        super(...arguments);
        this.getVisitors = async (req, res) => {
            try {
                const groupName = unifiedConfig_1.config.HIKCENTRAL.VISITOR_GROUP_NAME_VISITANTES;
                const visitors = await HikCentralService_1.HikCentralService.fetchVisitorsWithStatus(groupName);
                // Filtering for active/finished if needed, but for /painel/visitors we might want both or active
                // The requirement just said "Filtrar por visitorGroupID da pasta 'VISITANTES'"
                const serialized = visitors.map(v => ({
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
                console.error('[VisitorsController] Error fetching visitors:', error);
                return this.error(res, error.message);
            }
        };
    }
}
exports.VisitorsController = VisitorsController;
