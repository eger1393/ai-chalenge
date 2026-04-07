import { Controller, Get, Put, Body, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserProfileService } from './user-profile.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('profile')
@UseGuards(JwtAuthGuard)
export class UserProfileController {
  constructor(private readonly userProfileService: UserProfileService) {}

  @Get()
  getProfile(@Request() req) {
    return this.userProfileService.getProfile(req.user.userId);
  }

  @Put()
  upsertProfile(@Request() req, @Body() dto: UpdateProfileDto) {
    return this.userProfileService.upsertProfile(req.user.userId, dto);
  }
}
