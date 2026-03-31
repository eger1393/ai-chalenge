import { Injectable, UnauthorizedException, ConflictException, OnModuleInit, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private jwtService: JwtService,
    private readonly db: DatabaseService,
  ) {}

  async onModuleInit() {
    await this.seedAdminUser();
  }

  private async seedAdminUser() {
    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
    if (!adminUsername || !adminPasswordHash) return;

    const { rows } = await this.db.query(
      'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) ON CONFLICT (username) DO NOTHING RETURNING username',
      [adminUsername, adminPasswordHash, 'admin'],
    );
    if (rows.length > 0) {
      this.logger.log(`Seeded admin user: ${adminUsername}`);
    }
  }

  async login(username: string, password: string) {
    const { rows } = await this.db.query(
      'SELECT username, password_hash FROM users WHERE username = $1',
      [username],
    );
    if (rows.length === 0) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = await bcrypt.compare(password, rows[0].password_hash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.generateTokens(username);
  }

  async register(username: string, password: string) {
    const hash = await bcrypt.hash(password, 10);
    try {
      const { rows } = await this.db.query(
        `INSERT INTO users (username, password_hash) VALUES ($1, $2)
         RETURNING id, username, role, created_at AS "createdAt"`,
        [username, hash],
      );
      return rows[0];
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
      return this.generateTokens(payload.username);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async getMe(user: { username: string }) {
    const { rows } = await this.db.query(
      'SELECT role FROM users WHERE username = $1',
      [user.username],
    );
    return { username: user.username, role: rows[0]?.role || 'user' };
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

    return { accessToken, refreshToken, expiresIn: accessExpiration };
  }
}
