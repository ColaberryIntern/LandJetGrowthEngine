import '../config/environment';
import bcrypt from 'bcrypt';
import { getSequelize } from '../config/database';
import { initModels, User } from '../models';

async function seed() {
  const sequelize = getSequelize();
  initModels(sequelize);

  const email = 'admin@landjet.com';
  const existing = await User.findOne({ where: { email } });

  if (existing) {
    console.log('Admin user already exists');
    await sequelize.close();
    return;
  }

  const hash = await bcrypt.hash('Admin123!', 12);
  await User.create({
    email,
    password_hash: hash,
    first_name: 'Admin',
    last_name: 'LandJet',
    role: 'admin',
    status: 'active',
  });

  console.log('Admin user created: admin@landjet.com / Admin123!');
  await sequelize.close();
}

seed().catch((e) => { console.error(e); process.exit(1); });
