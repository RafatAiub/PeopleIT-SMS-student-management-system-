const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.institution.update({
  where: { id: 'inst-1' },
  data: { slug: '102030' }
}).then(() => console.log('Updated slug successfully')).catch(console.error).finally(() => prisma.$disconnect());
