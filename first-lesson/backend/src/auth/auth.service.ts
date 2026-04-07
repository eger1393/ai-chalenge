import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UserRepository } from './repositories/user.repository';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private jwtService: JwtService,
    private readonly userRepository: UserRepository,
  ) {}

  async onModuleInit() {
    await this.seedAdminUser();
  }

  private async seedAdminUser() {
    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
    if (!adminUsername || !adminPasswordHash) return;

    const created = await this.userRepository.createIfNotExists(
      adminUsername,
      adminPasswordHash,
      'admin',
    );
    if (created) {
      this.logger.log(`Seeded admin user: ${adminUsername}`);
    }
  }

  async login(username: string, password: string) {
    const user = await this.userRepository.findByUsername(username);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.generateTokens(user.id, user.username);
  }

  async register(username: string, password: string) {
    const hash = await bcrypt.hash(password, 10);
    try {
      const user = await this.userRepository.create(username, hash, 'user');
      return {
        id: user.id,
        username: user.username,
        role: user.role,
        createdAt: user.created_at,
      };
    } catch (err: any) {
      if (err.code === '23505') {
        throw new ConflictException('Username already exists');
      }
      throw err;
    }
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_SECRET || 'default-secret',
      });
      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid token type');
      }
      return this.generateTokens(payload.sub, payload.username);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async getMe(user: { userId: string; username: string }) {
    const found = await this.userRepository.findById(user.userId);
    return {
      username: found?.username || user.username,
      role: found?.role || 'user',
    };
  }

  private generateTokens(userId: string, username: string) {
    const secret = process.env.JWT_SECRET || 'default-secret';
    const accessExpiration = parseInt(
      process.env.JWT_ACCESS_EXPIRATION || '900',
    );
    const refreshExpiration = parseInt(
      process.env.JWT_REFRESH_EXPIRATION || '604800',
    );

    const accessToken = this.jwtService.sign(
      { sub: userId, username, type: 'access' },
      { secret, expiresIn: accessExpiration },
    );
    const refreshToken = this.jwtService.sign(
      { sub: userId, username, type: 'refresh' },
      { secret, expiresIn: refreshExpiration },
    );

    return { accessToken, refreshToken, expiresIn: accessExpiration };
  }
}
