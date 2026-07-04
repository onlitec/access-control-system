import { prisma } from '../database';

async function main() {
    const updatedBlocks = await prisma.block.updateMany({
        where: { name: 'Block 1' },
        data: { name: 'Bloco 1' }
    });
    console.log(`Updated ${updatedBlocks.count} blocks.`);

    const updatedTowers = await prisma.tower.updateMany({
        where: { name: 'Block 1' },
        data: { name: 'Bloco 1' }
    });
    console.log(`Updated ${updatedTowers.count} towers (Block 1 -> Bloco 1).`);

    const updatedTowers2 = await prisma.tower.updateMany({
        where: { name: 'Block 2' },
        data: { name: 'Bloco 2' }
    });
    console.log(`Updated ${updatedTowers2.count} towers (Block 2 -> Bloco 2).`);

    const allTowers = await prisma.tower.findMany();
    console.log('All towers in database:', allTowers);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
