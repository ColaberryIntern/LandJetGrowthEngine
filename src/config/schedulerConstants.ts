export const SCHEDULER = {
  CYCLE_INTERVAL_MS: 5 * 60 * 1000,        // 5 minutes
  MAX_PER_CYCLE: 40,                         // total actions per cycle
  MAX_PER_CAMPAIGN: 10,                      // per campaign per cycle
  DEFAULT_DELAY_SECONDS: 120,                // between sends
  STALE_THRESHOLD_MS: 10 * 60 * 1000,       // 10 minutes
  SEND_WINDOW_START: 8,                      // 8 AM CT
  SEND_WINDOW_END: 17,                       // 5 PM CT
  CALL_WINDOW_START: 9,                      // 9 AM CT
  CALL_WINDOW_END: 17,                       // 5 PM CT
  CALL_ACTIVE_DAYS: [1, 2, 3, 4, 5],        // Mon-Fri
  MAX_DAILY_CALLS: 50,
  MAX_CALL_DURATION_SECONDS: 300,
  RETRY_DELAY_MS: 30 * 60 * 1000,           // 30 minutes
  TIMEZONE: 'America/Chicago',
};
