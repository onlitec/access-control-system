import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || 'Admin';
  const role = process.env.ADMIN_ROLE?.trim() || 'ADMIN';
  const isProtected = process.env.ADMIN_PROTECTED === 'true';

  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set');
  }

  if (password.length < 8) {
    throw new Error('ADMIN_PASSWORD must have at least 8 characters');
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  // Check if user exists and is protected
  const existingUser = await prisma.user.findUnique({ where: { email } });

  if (existingUser?.isProtected) {
    // Protected users cannot be modified via bootstrap
    console.log(`bootstrap-admin: user is protected, skipping update (${existingUser.email}, role=${existingUser.role})`);
    return;
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      role,
      password: hashedPassword,
      ...(isProtected && { isProtected: true }),
    },
    create: {
      email,
      name,
      role,
      password: hashedPassword,
      isProtected: isProtected,
    },
  });

  console.log(`bootstrap-admin: user ready (${user.email}, role=${user.role}, protected=${user.isProtected})`);
}

main()
  .catch((error) => {
    console.error('bootstrap-admin error:', error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
