const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.message.deleteMany({}).then(() => {
  console.log('Cleared messages');
}).catch(console.error).finally(() => prisma.$disconnect());
