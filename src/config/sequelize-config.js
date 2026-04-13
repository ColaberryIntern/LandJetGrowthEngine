require('dotenv').config();

module.exports = {
  development: {
    url: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/landjet_growth_engine',
    dialect: 'postgres',
  },
  test: {
    url: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/landjet_growth_engine_test',
    dialect: 'postgres',
    logging: false,
  },
  production: {
    url: process.env.DATABASE_URL,
    dialect: 'postgres',
    dialectOptions: process.env.DATABASE_SSL === 'true' ? {
      ssl: { require: true, rejectUnauthorized: false },
    } : {},
  },
};
