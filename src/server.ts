import { createApp } from './app';
import { getConfig } from './config/environment';
import { getSequelize } from './config/database';
import { initModels } from './models';
import { startPipelineAutoRunner } from './services/pipelineAutoRunner';

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
      // Start the in-process pipeline auto-runner AFTER the server is listening,
      // so an autorunner failure cannot block the HTTP boot. Guarded by
      // PIPELINE_AUTORUN env var (default OFF) -- enable in prod by setting
      // PIPELINE_AUTORUN=true in landjet-backend env.
      startPipelineAutoRunner();
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
