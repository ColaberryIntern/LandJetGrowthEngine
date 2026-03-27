import { Sequelize, Options } from 'sequelize';

export function createSequelizeInstance(databaseUrl: string): Sequelize {
  const options: Options = {
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'test' ? false : console.log,
    pool: {
      max: 10,
      min: 2,
      acquire: 30000,
      idle: 10000,
    },
    define: {
      timestamps: true,
      underscored: true,
    },
  };

  return new Sequelize(databaseUrl, options);
}

let _sequelize: Sequelize | null = null;

export function getSequelize(): Sequelize {
  if (!_sequelize) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is required');
    }
    _sequelize = createSequelizeInstance(databaseUrl);
  }
  return _sequelize;
}

export async function testConnection(): Promise<boolean> {
  try {
    const sequelize = getSequelize();
    await sequelize.authenticate();
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}

export async function closeConnection(): Promise<void> {
  if (_sequelize) {
    await _sequelize.close();
    _sequelize = null;
  }
}
