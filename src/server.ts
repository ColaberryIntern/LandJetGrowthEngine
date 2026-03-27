import { createApp } from './app';
import { getConfig } from './config/environment';
import { getSequelize } from './config/database';
import { initModels } from './models';

async function start() {
  try {
    const config = getConfig();
    const app = createApp();

    // Initialize database and models
    const sequelize = getSequelize();
    initModels(sequelize);

    await sequelize.authenticate();
    console.log('Database connection established successfully.');

    app.listen(config.port, () => {
      console.log(`LandJet Growth Engine running on port ${config.port} [${config.nodeEnv}]`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
