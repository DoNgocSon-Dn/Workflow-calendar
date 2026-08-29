import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
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
import { UpsertGroupMeetingDto } from './dto/upsert-group-meeting.dto';
import { SendGroupMessageDto } from './dto/send-group-message.dto';
import { UpdateGroupMessageDto } from './dto/update-group-message.dto';
import { RespondGroupInviteDto } from './dto/respond-group-invite.dto';
import { CreateInviteLinkDto } from './dto/create-invite-link.dto';
import { RequestJoinGroupDto } from './dto/request-join-group.dto';
import { DecideJoinRequestDto } from './dto/decide-join-request.dto';
import { JoinByCodeDto } from './dto/join-by-code.dto';
import { ToggleReactionDto } from './dto/toggle-reaction.dto';
import { GroupsService } from './groups.service';

@Controller('groups')
@UseGuards(SupabaseAuthGuard)
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  // Các route tĩnh phải đứng TRƯỚC ':id', nếu không Nest sẽ khớp "invites" và
  // "tasks" thành groupId.
  @Get('invites/mine')
  async listMyInvites(@CurrentSupabase() supabase: SupabaseClient) {
    return this.groupsService.listMyInvites(supabase);
  }

  @Patch('invites/:inviteId/respond')
  async respondInvite(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Param('inviteId') inviteId: string,
    @Body() dto: RespondGroupInviteDto,
  ) {
    return this.groupsService.respondInvite(supabase, user.id, inviteId, dto);
  }

  @Get('tasks/mine')
  async listMyTasks(@CurrentSupabase() supabase: SupabaseClient) {
    return this.groupsService.listMyTasks(supabase);
  }

  // Token, không phải groupId — cũng phải đứng trước ':id'.
  @Get('invite-link/preview')
  async previewInviteLink(
    @CurrentSupabase() supabase: SupabaseClient,
    @Query('token') token: string,
  ) {
    return this.groupsService.getInviteLinkPreview(supabase, token);
  }

  @Post('invite-link/join')
  async requestJoinByToken(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Body() dto: RequestJoinGroupDto,
  ) {
    return this.groupsService.requestToJoin(supabase, user, dto.token);
  }

  @Post('join-by-code')
  async joinByCode(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Body() dto: JoinByCodeDto,
  ) {
    return this.groupsService.joinByCode(supabase, user, dto.code);
  }

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

  @Get(':id/invites')
  async listGroupInvites(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Param('id') groupId: string,
  ) {
    return this.groupsService.listGroupInvites(supabase, user, groupId);
  }

  @Delete(':id/invites/:inviteId')
  async cancelGroupInvite(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Param('id') groupId: string,
    @Param('inviteId') inviteId: string,
  ) {
    await this.groupsService.cancelGroupInvite(supabase, user, groupId, inviteId);
    return { ok: true };
  }

  @Get(':id/invite-link')
  async getInviteLink(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Param('id') groupId: string,
  ) {
    return this.groupsService.getInviteLink(supabase, user, groupId);
  }

  @Post(':id/invite-link')
  async regenerateInviteLink(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Param('id') groupId: string,
    @Body() dto: CreateInviteLinkDto,
  ) {
    return this.groupsService.createOrRegenerateInviteLink(
      supabase,
      user,
      groupId,
      dto.role,
    );
  }

  @Get(':id/join-code')
  async getJoinCode(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Param('id') groupId: string,
  ) {
    return this.groupsService.getJoinCode(supabase, user, groupId);
  }

  @Post(':id/join-code')
  async regenerateJoinCode(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Param('id') groupId: string,
  ) {
    return this.groupsService.regenerateJoinCode(supabase, user, groupId);
  }

  @Get(':id/join-requests')
  async listJoinRequests(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Param('id') groupId: string,
  ) {
    return this.groupsService.listJoinRequests(supabase, user, groupId);
  }

  @Patch(':id/join-requests/:requestId')
  async decideJoinRequest(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Param('id') groupId: string,
    @Param('requestId') requestId: string,
    @Body() dto: DecideJoinRequestDto,
  ) {
    return this.groupsService.decideJoinRequest(
      supabase,
      user,
      groupId,
      requestId,
      dto,
    );
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
    @CurrentUser() user: User,
    @Param('id') groupId: string,
    @Param('userId') userId: string,
  ) {
    // `user` bắt buộc phải truyền xuống: service dùng nó để kiểm tra thứ bậc.
    await this.groupsService.removeMember(supabase, user, groupId, userId);
    return { message: 'Đã xóa thành viên khỏi nhóm' };
  }

  @Patch(':id/members/:userId/transfer-leadership')
  async transferLeadership(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Param('id') groupId: string,
    @Param('userId') userId: string,
  ) {
    const members = await this.groupsService.transferLeadership(
      supabase,
      user,
      groupId,
      userId,
    );
    return { members };
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
    @CurrentUser() user: User,
    @Param('id') groupId: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateGroupTaskDto,
  ) {
    return this.groupsService.updateTask(supabase, user, groupId, taskId, dto);
  }

  @Delete(':id/tasks/:taskId')
  async deleteTask(
    @CurrentSupabase() supabase: SupabaseClient,
    @Param('id') groupId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.groupsService.deleteTask(supabase, groupId, taskId);
  }

  @Get(':id/meeting')
  async getMeeting(
    @CurrentSupabase() supabase: SupabaseClient,
    @Param('id') groupId: string,
  ) {
    return this.groupsService.getMeeting(supabase, groupId);
  }

  @Put(':id/meeting')
  async upsertMeeting(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Param('id') groupId: string,
    @Body() dto: UpsertGroupMeetingDto,
  ) {
    return this.groupsService.upsertMeeting(supabase, user, groupId, dto);
  }

  @Delete(':id/meeting')
  async deleteMeeting(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Param('id') groupId: string,
  ) {
    await this.groupsService.deleteMeeting(supabase, user, groupId);
    return { ok: true };
  }

  @Get(':id/messages')
  async getMessages(
    @CurrentSupabase() supabase: SupabaseClient,
    @Param('id') groupId: string,
  ) {
    return this.groupsService.getMessages(supabase, groupId);
  }

  @Get(':id/message-reads')
  async getMessageReads(
    @CurrentSupabase() supabase: SupabaseClient,
    @Param('id') groupId: string,
  ) {
    return this.groupsService.getMessageReads(supabase, groupId);
  }

  @Post(':id/messages/read')
  async markMessagesRead(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Param('id') groupId: string,
  ) {
    return this.groupsService.markMessagesRead(supabase, user, groupId);
  }

  @Get(':id/message-reactions')
  async listReactions(
    @CurrentSupabase() supabase: SupabaseClient,
    @Param('id') groupId: string,
  ) {
    return this.groupsService.listReactions(supabase, groupId);
  }

  @Post(':id/messages/:messageId/reactions')
  async toggleReaction(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Param('id') groupId: string,
    @Param('messageId') messageId: string,
    @Body() dto: ToggleReactionDto,
  ) {
    return this.groupsService.toggleReaction(supabase, user, groupId, messageId, dto.emoji);
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
