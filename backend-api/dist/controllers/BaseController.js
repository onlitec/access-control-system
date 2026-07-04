"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseController = void 0;
class BaseController {
    success(res, data, message = 'Success') {
        return res.status(200).json({
            success: true,
            message,
            data,
        });
    }
    error(res, message = 'Internal Server Error', status = 500) {
        return res.status(status).json({
            success: false,
            error: message,
        });
    }
    notFound(res, message = 'Resource not found') {
        return this.error(res, message, 404);
    }
    badRequest(res, message = 'Bad Request') {
        return this.error(res, message, 400);
    }
    unauthorized(res, message = 'Unauthorized') {
        return this.error(res, message, 401);
    }
}
exports.BaseController = BaseController;
