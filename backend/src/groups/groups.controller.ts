import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { CurrentSupabase } from '../auth/current-supabase.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { SetGroupHiddenDto } from './dto/set-group-hidden.dto';
import { InviteGroupMemberDto } from './dto/invite-group-member.dto';
import { UpdateGroupMemberRoleDto } from './dto/update-group-member-role.dto';
import { CreateGroupTaskDto } from './dto/create-group-task.dto';
import { UpdateGroupTaskDto } from './dto/update-group-task.dto';
import { SendGroupMessageDto } from './dto/send-group-message.dto';
import { UpdateGroupMessageDto } from './dto/update-group-message.dto';
import { GroupsService } from './groups.service';

@Controller('groups')
@UseGuards(SupabaseAuthGuard)
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post()
  async createGroup(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Body() dto: CreateGroupDto,
  ) {
    return this.groupsService.createGroup(supabase, user, dto);
  }

  @Get()
  async findAllForUser(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
  ) {
    return this.groupsService.findAllForUser(supabase, user);
  }

  @Get(':id')
  async findOne(
    @CurrentSupabase() supabase: SupabaseClient,
    @Param('id') groupId: string,
  ) {
    return this.groupsService.findOne(supabase, groupId);
  }

  @Patch(':id')
  async updateGroup(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Param('id') groupId: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.groupsService.updateGroup(supabase, user, groupId, dto);
  }

  @Delete(':id')
  async deleteGroup(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Param('id') groupId: string,
  ) {
    await this.groupsService.deleteGroup(supabase, user, groupId);
    return { message: 'Đã xóa nhóm' };
  }

  // Ẩn/hiện chỉ đổi trạng thái của chính người gọi nên mọi thành viên đều gọi
  // được — khác với PATCH/DELETE :id vốn giới hạn ở người tạo nhóm.
  @Patch(':id/visibility')
  async setVisibility(
    @CurrentSupabase() supabase: SupabaseClient,
    @Param('id') groupId: string,
    @Body() dto: SetGroupHiddenDto,
  ) {
    return this.groupsService.setHidden(supabase, groupId, dto);
  }

  @Post(':id/members/invite')
  async inviteMember(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Param('id') groupId: string,
    @Body() dto: InviteGroupMemberDto,
  ) {
    return this.groupsService.inviteMember(supabase, user, groupId, dto);
  }

  @Patch(':id/members/:userId/role')
  async updateMemberRole(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Param('id') groupId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateGroupMemberRoleDto,
  ) {
    return this.groupsService.updateMemberRole(
      supabase,
      user,
      groupId,
      userId,
      dto,
    );
  }

  @Delete(':id/members/:userId')
  async removeMember(
    @CurrentSupabase() supabase: SupabaseClient,
    @Param('id') groupId: string,
    @Param('userId') userId: string,
  ) {
    await this.groupsService.removeMember(supabase, groupId, userId);
    return { message: 'Đã xóa thành viên khỏi nhóm' };
  }

  @Get(':id/tasks')
  async getTasks(
    @CurrentSupabase() supabase: SupabaseClient,
    @Param('id') groupId: string,
  ) {
    return this.groupsService.getTasks(supabase, groupId);
  }

  @Post(':id/tasks')
  async createTask(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Param('id') groupId: string,
    @Body() dto: CreateGroupTaskDto,
  ) {
    return this.groupsService.createTask(supabase, user, groupId, dto);
  }

  @Patch(':id/tasks/:taskId')
  async updateTask(
    @CurrentSupabase() supabase: SupabaseClient,
    @Param('id') groupId: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateGroupTaskDto,
  ) {
    return this.groupsService.updateTask(supabase, groupId, taskId, dto);
  }

  @Get(':id/messages')
  async getMessages(
    @CurrentSupabase() supabase: SupabaseClient,
    @Param('id') groupId: string,
  ) {
    return this.groupsService.getMessages(supabase, groupId);
  }

  @Post(':id/messages')
  async sendMessage(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Param('id') groupId: string,
    @Body() dto: SendGroupMessageDto,
  ) {
    return this.groupsService.sendMessage(supabase, user, groupId, dto);
  }

  @Patch(':id/messages/:messageId')
  async editMessage(
    @CurrentSupabase() supabase: SupabaseClient,
    @Param('id') groupId: string,
    @Param('messageId') messageId: string,
    @Body() dto: UpdateGroupMessageDto,
  ) {
    return this.groupsService.editMessage(supabase, groupId, messageId, dto);
  }

  @Delete(':id/messages/:messageId')
  async deleteMessage(
    @CurrentSupabase() supabase: SupabaseClient,
    @Param('id') groupId: string,
    @Param('messageId') messageId: string,
  ) {
    return this.groupsService.deleteMessage(supabase, groupId, messageId);
  }
}
