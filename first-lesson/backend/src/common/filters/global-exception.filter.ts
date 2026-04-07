import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // If headers already sent (SSE stream), don't try to send a JSON response.
    // SSE handlers manage their own error writing.
    if (response.headersSent) {
      this.logException(exception, request);
      return;
    }

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    this.logException(exception, request);

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(typeof message === 'string' ? { message } : (message as object)),
    });
  }

  private logException(exception: unknown, request: Request): void {
    const method = request?.method ?? 'UNKNOWN';
    const url = request?.url ?? 'UNKNOWN';

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status >= 500) {
        this.logger.error(
          `${method} ${url} → ${status}: ${exception.message}`,
          exception.stack,
        );
      } else {
        this.logger.warn(`${method} ${url} → ${status}: ${exception.message}`);
      }
    } else if (exception instanceof Error) {
      this.logger.error(
        `${method} ${url} → Unhandled: ${exception.message}`,
        exception.stack,
      );
    } else {
      this.logger.error(
        `${method} ${url} → Unhandled non-Error: ${JSON.stringify(exception)}`,
      );
    }
  }
}
