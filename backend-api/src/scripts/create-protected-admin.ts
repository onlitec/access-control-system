import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const prisma = new PrismaClient();

/**
 * Script to create the protected admin user.
 * This user cannot be deleted or modified through the API.
 */
async function main() {
  const email = process.env.INITIAL_ADMIN_EMAIL || 'admin@example.com';
  const password = process.env.INITIAL_ADMIN_PASSWORD || 'change-me-immediately';
  const name = process.env.INITIAL_ADMIN_NAME || 'System Admin';
  const role = 'ADMIN';

  if (password.length < 8) {
    throw new Error('Password must have at least 8 characters');
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({ where: { email } });

  if (existingUser) {
    if (existingUser.isProtected) {
      console.log(`create-protected-admin: protected user already exists (${existingUser.email})`);
      return;
    }
    // Upgrade existing user to protected
    const user = await prisma.user.update({
      where: { email },
      data: {
        name,
        role,
        password: hashedPassword,
        isProtected: true,
      },
    });
    console.log(`create-protected-admin: user upgraded to protected (${user.email}, role=${user.role})`);
    return;
  }

  // Create new protected user
  const user = await prisma.user.create({
    data: {
      email,
      name,
      role,
      password: hashedPassword,
      isProtected: true,
    },
  });

  console.log(`create-protected-admin: protected user created (${user.email}, role=${user.role})`);
}

main()
  .catch((error) => {
    console.error('create-protected-admin error:', error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
