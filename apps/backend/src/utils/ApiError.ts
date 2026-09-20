import { ErrorCode } from '../constants/errorCodes.js';

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(statusCode: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, ErrorCode.VALIDATION_ERROR, message, details);
  }

  static unauthorized(message = 'ຕ້ອງເຂົ້າສູ່ລະບົບກ່ອນ', code: ErrorCode = ErrorCode.UNAUTHORIZED): ApiError {
    return new ApiError(401, code, message);
  }

  static forbidden(message = 'ບໍ່ມີສິດເຂົ້າເຖິງ'): ApiError {
    return new ApiError(403, ErrorCode.FORBIDDEN, message);
  }

  static notFound(message = 'ບໍ່ພົບຂໍ້ມູນ'): ApiError {
    return new ApiError(404, ErrorCode.NOT_FOUND, message);
  }

  static conflict(message: string, code: ErrorCode = ErrorCode.CONFLICT): ApiError {
    return new ApiError(409, code, message);
  }
}
