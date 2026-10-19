import { config, validateConfig } from '../config/env';
import { connectDatabase, disconnectDatabase } from '../config/db';
import { Category } from '../models/Category';
import { Service } from '../models/Service';
import { User } from '../models/User';
import { ProviderProfile } from '../models/ProviderProfile';
import { hashPassword } from '../utils/auth';

/**
 * Seed Default Service Catalog & Demo Approved Providers
 * Aligned with the Interactive Home Cutaway Reference
 */
export const seedCatalog = async (): Promise<void> => {
  try {
    validateConfig();
    await connectDatabase();

    console.log('[Catalog Seed] Seeding service categories and services...');

    const catalogDefinitions = [
      {
        category: {
          name: 'Roofing & Waterproofing',
          slug: 'roofing-waterproofing',
          description: 'Specialized roof repair, waterproofing, and exterior drainage services.',
          icon: 'home',
          rooms: ['roof'],
          isActive: true,
        },
        services: [
          { name: 'Waterproofing', slug: 'waterproofing', description: 'Terrace and tile leak-proofing' },
          { name: 'Roof repair', slug: 'roof-repair', description: 'Tile replacement and structural fixes' },
          { name: 'Gutter cleaning', slug: 'gutter-cleaning', description: 'Debris removal and downspout checks' },
        ],
      },
      {
        category: {
          name: 'Plumbing & Sanitary',
          slug: 'plumbing-sanitary',
          description: 'Bathroom fixtures, leak repairs, pipe fitting, and tiling solutions.',
          icon: 'droplet',
          rooms: ['bath', 'kitchen'],
          isActive: true,
        },
        services: [
          { name: 'Plumbing', slug: 'plumbing-general', description: 'General pipe, tap, and valve fixes' },
          { name: 'Tiling', slug: 'tiling-repairs', description: 'Wall and floor tile restoration' },
          { name: 'Leak repair', slug: 'leak-repair', description: 'Advanced moisture and pressure diagnostics' },
        ],
      },
      {
        category: {
          name: 'Electrical & Climate Control',
          slug: 'electrical-climate',
          description: 'Home wiring, breaker repairs, lighting, and air conditioning servicing.',
          icon: 'zap',
          rooms: ['living'],
          isActive: true,
        },
        services: [
          { name: 'Electrician', slug: 'electrician-general', description: 'Wiring, MCB switches, and fans' },
          { name: 'AC service', slug: 'ac-service', description: 'Filter clean, gas recharge, and servicing' },
          { name: 'Painting', slug: 'painting-interior', description: 'Wall touch-ups and fresh coatings' },
        ],
      },
      {
        category: {
          name: 'Kitchen & Appliance Care',
          slug: 'kitchen-appliances',
          description: 'Refrigerator, mixer, wet grinder, microwave, and chimney servicing.',
          icon: 'tool',
          rooms: ['kitchen'],
          isActive: true,
        },
        services: [
          { name: 'Appliance repair', slug: 'appliance-repair', description: 'Fridge, microwave, and wet grinder fixes' },
          { name: 'Chimney cleaning', slug: 'chimney-cleaning', description: 'Deep degreasing and filter change' },
        ],
      },
      {
        category: {
          name: 'Garden & Outdoor Care',
          slug: 'garden-outdoor',
          description: 'Landscaping, eco-friendly pest control, and pressure washing services.',
          icon: 'sun',
          rooms: ['garden'],
          isActive: true,
        },
        services: [
          { name: 'Pest control', slug: 'pest-control', description: 'Termite, cockroach, and bug management' },
          { name: 'Gardening', slug: 'gardening-care', description: 'Lawn trimming, pruning, and weed control' },
          { name: 'Pressure washing', slug: 'pressure-washing', description: 'Driveway and facade deep wash' },
        ],
      },
    ];

    for (const def of catalogDefinitions) {
      let category = await Category.findOne({ slug: def.category.slug });
      if (!category) {
        category = await new Category(def.category).save();
        console.log(`[Catalog Seed] Created category: ${category.name}`);
      } else {
        category.rooms = def.category.rooms;
        category.isActive = true;
        await category.save();
      }

      for (const s of def.services) {
        const existingService = await Service.findOne({ slug: s.slug });
        if (!existingService) {
          await new Service({
            categoryId: category._id,
            name: s.name,
            slug: s.slug,
            description: s.description,
            isActive: true,
          }).save();
          console.log(`[Catalog Seed]   - Created service: ${s.name}`);
        }
      }
    }

    // Seed approved sample providers from reference if not present
    const demoProviders = [
      {
        name: 'Karthik Raja',
        email: 'karthik.roofing@example.com',
        displayName: 'Karthik Raja Waterproofing',
        phone: '+91 98401 22334',
        serviceArea: 'Central & Coastal Zone',
        skills: ['Waterproofing', 'Roof repair', 'Gutter cleaning'],
      },
      {
        name: 'Selvi Murugan',
        email: 'selvi.plumbing@example.com',
        displayName: 'Selvi Murugan Plumber',
        phone: '+91 98402 33445',
        serviceArea: 'Metro West & Downtown',
        skills: ['Plumbing', 'Tiling', 'Leak repair'],
      },
      {
        name: 'Naveen Kumar',
        email: 'naveen.electrical@example.com',
        displayName: 'Naveen Kumar Electrician',
        phone: '+91 98403 44556',
        serviceArea: 'All City Zones',
        skills: ['Electrician', 'AC service', 'Painting'],
      },
      {
        name: 'Priya Appliances',
        email: 'priya.appliances@example.com',
        displayName: 'Priya Appliance Care',
        phone: '+91 98404 55667',
        serviceArea: 'North District & Suburbs',
        skills: ['Appliance repair', 'Chimney cleaning', 'Plumbing'],
      },
      {
        name: 'GreenLeaf Care',
        email: 'greenleaf.garden@example.com',
        displayName: 'GreenLeaf Outdoor Care',
        phone: '+91 98405 66778',
        serviceArea: 'South Suburbs & Estates',
        skills: ['Gardening', 'Pest control', 'Pressure washing'],
      },
    ];

    const defaultHash = await hashPassword('DemoProvider2026!');

    for (const p of demoProviders) {
      let user = await User.findOne({ email: p.email });
      if (!user) {
        user = await new User({
          name: p.name,
          email: p.email,
          passwordHash: defaultHash,
          role: 'provider',
          isActive: true,
        }).save();
      }

      let profile = await ProviderProfile.findOne({ userId: user._id });
      if (!profile) {
        await new ProviderProfile({
          userId: user._id,
          displayName: p.displayName,
          phone: p.phone,
          serviceArea: p.serviceArea,
          skills: p.skills,
          verificationStatus: 'approved', // Seeded as verified
          reviewedAt: new Date(),
        }).save();
        console.log(`[Catalog Seed] Created demo approved provider: ${p.displayName}`);
      } else if (profile.verificationStatus !== 'approved') {
        profile.verificationStatus = 'approved';
        await profile.save();
      }
    }

    console.log('[Catalog Seed] Seeding completed successfully.');
    await disconnectDatabase();
  } catch (error) {
    console.error('[Catalog Seed Error]', error);
    await disconnectDatabase().catch(() => {});
    process.exit(1);
  }
};

if (require.main === module) {
  seedCatalog().then(() => process.exit(0));
}
