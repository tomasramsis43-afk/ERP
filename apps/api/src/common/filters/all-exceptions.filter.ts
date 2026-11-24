import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    if (!isHttp) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    const body = isHttp ? exception.getResponse() : 'Internal server error';
    res.status(status).json({
      statusCode: status,
      error: typeof body === 'string' ? { message: body } : body,
      timestamp: new Date().toISOString(),
    });
  }
}
