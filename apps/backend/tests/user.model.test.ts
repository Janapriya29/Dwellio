import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { User } from '../src/models/User';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup';

describe('User Model Validation & Behavior', () => {
  beforeAll(async () => {
    await connectTestDb('dwellio_test_user');
    await User.syncIndexes(); // Ensure indexes are built
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  it('should successfully create a valid customer user', async () => {
    const validUser = new User({
      name: 'John Doe',
      email: 'john.doe@example.com',
      passwordHash: 'dummy_hash_for_testing',
      role: 'customer',
    });

    const saved = await validUser.save();
    expect(saved._id).toBeDefined();
    expect(saved.name).toBe('John Doe');
    expect(saved.email).toBe('john.doe@example.com');
    expect(saved.role).toBe('customer');
    expect(saved.isActive).toBe(true);
    expect(saved.createdAt).toBeInstanceOf(Date);
    expect(saved.updatedAt).toBeInstanceOf(Date);
  });

  it('should normalize and lowercase the email address and trim name', async () => {
    const user = new User({
      name: '   Jane Smith   ',
      email: '  Jane.Smith@EXAMPLE.com  ',
      passwordHash: 'dummy_hash',
    });

    const saved = await user.save();
    expect(saved.name).toBe('Jane Smith');
    expect(saved.email).toBe('jane.smith@example.com');
  });

  it('should default role to "customer" when not specified', async () => {
    const user = new User({
      name: 'Default Role User',
      email: 'default@example.com',
      passwordHash: 'dummy_hash',
    });

    const saved = await user.save();
    expect(saved.role).toBe('customer');
  });

  it('should fail validation if required fields are missing', async () => {
    const emptyUser = new User({});

    let error: any;
    try {
      await emptyUser.validate();
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.errors.name).toBeDefined();
    expect(error.errors.email).toBeDefined();
    expect(error.errors.passwordHash).toBeDefined();
  });

  it('should fail validation if email format is invalid', async () => {
    const invalidEmailUser = new User({
      name: 'Bad Email',
      email: 'not-an-email',
      passwordHash: 'dummy_hash',
    });

    await expect(invalidEmailUser.validate()).rejects.toThrow();
  });

  it('should fail validation if an invalid role is provided', async () => {
    const badRoleUser = new User({
      name: 'Bad Role',
      email: 'badrole@example.com',
      passwordHash: 'dummy_hash',
      role: 'superman' as any,
    });

    await expect(badRoleUser.validate()).rejects.toThrow();
  });

  it('should enforce unique email constraint', async () => {
    const user1 = new User({
      name: 'User One',
      email: 'duplicate@example.com',
      passwordHash: 'dummy_hash_1',
    });
    await user1.save();

    const user2 = new User({
      name: 'User Two',
      email: 'duplicate@example.com',
      passwordHash: 'dummy_hash_2',
    });

    await expect(user2.save()).rejects.toThrow();
  });
});
