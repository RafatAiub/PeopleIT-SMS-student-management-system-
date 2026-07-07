const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.branch.findFirst().then(b => console.log(b.id)).catch(console.error).finally(() => prisma.$disconnect());
