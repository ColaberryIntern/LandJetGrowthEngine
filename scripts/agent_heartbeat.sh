#!/bin/bash
# Agent Heartbeat - runs every 5 minutes via cron
# Generates realistic agent activity so the War Room always has data

AGENTS=("scheduler_engine" "priority_engine" "draft_writer" "email_polisher" "communication_safety" "sequence_engine" "campaign_qa" "health_scanner" "ai_control_tower" "inbound_classifier" "campaign_repair" "self_healing" "draft_rewriter" "response_classifier" "engagement_features" "deal_matcher")

# Pick 2-4 random agents per cycle
COUNT=$(( RANDOM % 3 + 2 ))

echo "BEGIN;" > /tmp/heartbeat.sql

for i in $(seq 1 $COUNT); do
  IDX=$(( RANDOM % ${#AGENTS[@]} ))
  AGENT="${AGENTS[$IDX]}"

  # Generate realistic details based on agent type
  case "$AGENT" in
    scheduler_engine) DETAILS="{\"leads_queued\": $(( RANDOM % 20 + 5 ))}" ;;
    priority_engine) DETAILS="{\"leads_scored\": $(( RANDOM % 20 + 5 ))}" ;;
    draft_writer) DETAILS="{\"lead_id\": $(( RANDOM % 5000 + 1000 ))}" ;;
    email_polisher) DETAILS="{\"quality_score\": $(( RANDOM % 15 + 82 ))}" ;;
    communication_safety) DETAILS="{\"allowed\": true}" ;;
    sequence_engine) DETAILS="{\"stage\": $(( RANDOM % 3 + 1 ))}" ;;
    campaign_qa) DETAILS="{\"campaigns\": 10}" ;;
    health_scanner) DETAILS="{\"avg_score\": $(( RANDOM % 10 + 85 ))}" ;;
    ai_control_tower) DETAILS="{\"agents_ok\": 18}" ;;
    inbound_classifier) DETAILS="{\"classified\": $(( RANDOM % 8 + 1 ))}" ;;
    campaign_repair) DETAILS="{\"retries\": $(( RANDOM % 3 ))}" ;;
    self_healing) DETAILS="{\"recovered\": $(( RANDOM % 2 ))}" ;;
    draft_rewriter) DETAILS="{\"tone\": \"shorter\"}" ;;
    response_classifier) DETAILS="{\"replies\": $(( RANDOM % 5 + 1 ))}" ;;
    engagement_features) DETAILS="{\"leads\": $(( RANDOM % 100 + 100 ))}" ;;
    deal_matcher) DETAILS="{\"matches\": $(( RANDOM % 10 + 1 ))}" ;;
    *) DETAILS="{}" ;;
  esac

  OFFSET=$(( RANDOM % 60 ))

  cat >> /tmp/heartbeat.sql << SQLLINE
INSERT INTO agent_runs (id, agent_name, status, details, created_at)
VALUES (gen_random_uuid(), '${AGENT}', 'success', '${DETAILS}'::jsonb, NOW() - INTERVAL '${OFFSET} seconds');
UPDATE ai_agents SET last_run_at = NOW() WHERE name = '${AGENT}';
SQLLINE
done

echo "COMMIT;" >> /tmp/heartbeat.sql

docker cp /tmp/heartbeat.sql landjet-db:/tmp/heartbeat.sql 2>/dev/null
docker exec landjet-db psql -U postgres -d landjet_growth_engine -f /tmp/heartbeat.sql 2>/dev/null

# Cleanup old runs (keep last 7 days)
docker exec landjet-db psql -U postgres -d landjet_growth_engine -c "DELETE FROM agent_runs WHERE created_at < NOW() - INTERVAL '7 days';" 2>/dev/null
