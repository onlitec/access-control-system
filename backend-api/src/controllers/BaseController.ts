import { Response } from 'express';

export abstract class BaseController {
    protected success(res: Response, data: any, message: string = 'Success') {
        return res.status(200).json({
            success: true,
            message,
            data,
        });
    }

    protected error(res: Response, message: string = 'Internal Server Error', status: number = 500) {
        return res.status(status).json({
            success: false,
            error: message,
        });
    }

    protected notFound(res: Response, message: string = 'Resource not found') {
        return this.error(res, message, 404);
    }

    protected badRequest(res: Response, message: string = 'Bad Request') {
        return this.error(res, message, 400);
    }

    protected unauthorized(res: Response, message: string = 'Unauthorized') {
        return this.error(res, message, 401);
    }
}
