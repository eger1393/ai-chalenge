import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];
    const expected = process.env.REGISTRATION_API_KEY;

    if (!expected) throw new ForbiddenException('Registration is disabled');
    if (!apiKey) throw new ForbiddenException('API key required');

    const a = Buffer.from(String(apiKey), 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ForbiddenException('Invalid API key');
    }
    return true;
  }
}
