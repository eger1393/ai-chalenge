import { IsString, MaxLength } from 'class-validator';

export class SetFactDto {
  @IsString()
  @MaxLength(200)
  key!: string;

  @IsString()
  value!: string;
}
