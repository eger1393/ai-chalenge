import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(private jwtService: JwtService) {}

  async login(username: string, password: string) {
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH || '';

    if (username !== adminUsername) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = await bcrypt.compare(password, adminPasswordHash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.generateTokens(username);
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_SECRET || 'default-secret',
      });

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid token type');
      }

      return this.generateTokens(payload.username);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  getMe(user: { username: string }) {
    return { username: user.username, role: 'admin' };
  }

  private generateTokens(username: string) {
    const secret = process.env.JWT_SECRET || 'default-secret';
    const accessExpiration = parseInt(process.env.JWT_ACCESS_EXPIRATION || '900');
    const refreshExpiration = parseInt(process.env.JWT_REFRESH_EXPIRATION || '604800');

    const accessToken = this.jwtService.sign(
      { sub: username, username, type: 'access' },
      { secret, expiresIn: accessExpiration },
    );

    const refreshToken = this.jwtService.sign(
      { sub: username, username, type: 'refresh' },
      { secret, expiresIn: refreshExpiration },
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: accessExpiration,
    };
  }
}
