import type { TTempFile } from '@sharkord/shared';
import { ChannelPermission, Permission } from '@sharkord/shared';
import { beforeEach, describe, expect, test } from 'bun:test';
import fs from 'fs/promises';
import { initTest, login, uploadFile } from '../../__tests__/helpers';
import { tdb } from '../../__tests__/setup';
import { files, messageFiles, rolePermissions } from '../../db/schema';
import { fileManager } from '../../utils/file-manager';

describe('files router', () => {
  let tempFile: TTempFile;
  let counter = 0;

  beforeEach(async () => {
    const response = await login('testowner', 'password123');
    const data: any = await response.json();

    const res = await uploadFile(
      new File(['test'], `file-${counter++}.txt`, { type: 'text/plain' }),
      data.token
    );

    tempFile = (await res.json()) as TTempFile;
  });

  test('should check temporary file existence', async () => {
    expect(tempFile).toBeDefined();
    expect(tempFile.id).toBeDefined();

    const file = await fileManager.getTemporaryFile(tempFile.id);

    expect(file).toBeDefined();
    expect(file?.path).toBe(tempFile.path);
    expect(file?.originalName).toBe(tempFile.originalName);
    expect(file?.size).toBe(tempFile.size);

    const stat = await fs.stat(tempFile.path);

    expect(stat.size).toBe(tempFile.size);
  });

  test('should delete a temporary file', async () => {
    const { caller } = await initTest();

    expect(await fs.exists(tempFile.path)).toBe(true);

    await caller.files.deleteTemporary({
      fileId: tempFile.id
    });

    expect(await fs.exists(tempFile.path)).toBe(false);
  });

  test('should throw when deleting a non-existent temporary file', async () => {
    const { caller } = await initTest();

    await expect(
      caller.files.deleteTemporary({
        fileId: '<non-existent-file-id>' // non-existent file ID
      })
    ).rejects.toThrow('Temporary file not found');
  });

  test('should throw when deleting other users temporary file', async () => {
    const { caller } = await initTest(2);

    await expect(
      caller.files.deleteTemporary({
        fileId: tempFile.id
      })
    ).rejects.toThrow(
      'You do not have permission to delete this temporary file'
    );

    expect(await fs.exists(tempFile.path)).toBe(true);
  });

  test('should throw when deleting file without VIEW_CHANNEL on private non-DM channel', async () => {
    const { caller: caller1 } = await initTest(1);
    const { caller: caller2 } = await initTest(2);

    await caller1.channels.update({
      channelId: 1,
      name: 'General',
      topic: 'General text channel',
      private: true
    });

    await caller1.channels.updatePermissions({
      channelId: 1,
      roleId: 2,
      permissions: [ChannelPermission.SEND_MESSAGES]
    });

    await tdb.insert(rolePermissions).values({
      roleId: 2,
      permission: Permission.MANAGE_MESSAGES,
      createdAt: Date.now()
    });

    const messageId = await caller1.messages.send({
      channelId: 1,
      content: 'Message with attachment',
      files: []
    });

    const now = Date.now();

    const [insertedFile] = await tdb
      .insert(files)
      .values({
        name: `private-${now}.txt`,
        originalName: 'private-file.txt',
        md5: `md5-private-${now}`,
        userId: 1,
        size: 42,
        mimeType: 'text/plain',
        extension: 'txt',
        createdAt: now
      })
      .returning({ id: files.id });

    await tdb.insert(messageFiles).values({
      messageId,
      fileId: insertedFile!.id,
      createdAt: now
    });

    await expect(
      caller2.files.delete({ fileId: insertedFile!.id })
    ).rejects.toThrow('Insufficient channel permissions');
  });

  test('should throw when non-participant deletes file from DM message', async () => {
    const { caller } = await initTest(1);

    const now = Date.now();

    const [insertedFile] = await tdb
      .insert(files)
      .values({
        name: `dm-${now}.txt`,
        originalName: 'dm-file.txt',
        md5: `md5-dm-${now}`,
        userId: 3,
        size: 42,
        mimeType: 'text/plain',
        extension: 'txt',
        createdAt: now
      })
      .returning({ id: files.id });

    await tdb.insert(messageFiles).values({
      messageId: 2,
      fileId: insertedFile!.id,
      createdAt: now
    });

    await expect(
      caller.files.delete({ fileId: insertedFile!.id })
    ).rejects.toThrow('You are not a participant in this DM channel');
  });
});
