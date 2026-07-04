import { prisma } from '../database';

const residentFields = [
  'fullName', 'cpf', 'rg', 'phone', 'email', 'photo', 'vehiclePlate', 'parkingSpaces'
];

const visitorFields = [
  'fullName', 'cpf', 'rg', 'phone', 'photo', 'vehiclePlate'
];

const condoProviderFields = [
  'fullName', 'cpf', 'rg', 'phone', 'photo', 'companyName', 'cnpj', 'vehiclePlate', 'serviceType'
];

const residentProviderFields = [
  'fullName', 'cpf', 'rg', 'phone', 'photo', 'serviceType'
];

async function main() {
  console.log('Seeding registration requirements...');

  const categories = [
    { name: 'resident', fields: residentFields },
    { name: 'visitor', fields: visitorFields },
    { name: 'condo_provider', fields: condoProviderFields },
    { name: 'resident_provider', fields: residentProviderFields }
  ];

  for (const cat of categories) {
    for (const field of cat.fields) {
      await prisma.registrationRequirement.upsert({
        where: {
          category_fieldName: {
            category: cat.name,
            fieldName: field
          }
        },
        update: {},
        create: {
          category: cat.name,
          fieldName: field,
          status: 'optional'
        }
      });
    }
  }

  console.log('Registration requirements seeded successfully.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
