#!/usr/bin/env bash
# ==============================================================================
# Dwellio Production Database Backup Script
# ==============================================================================
# Performs a logical, compressed, timestamped MongoDB backup using mongodump.
#
# Usage:
#   ./scripts/backup-db.sh [backup_directory]
#
# Environment Variables:
#   MONGO_URI              Target MongoDB connection URI (default: mongodb://127.0.0.1:27017/dwellio)
#   BACKUP_DIR             Destination directory (default: ./backups)
#   BACKUP_RETENTION_DAYS  Days to retain local backup files (default: 7)
# ==============================================================================

set -euo pipefail

BACKUP_DIR="${1:-${BACKUP_DIR:-./backups}}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
TARGET_URI="${MONGO_URI:-mongodb://127.0.0.1:27017/dwellio}"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILENAME="dwellio_backup_${TIMESTAMP}.archive.gz"
BACKUP_FILEPATH="${BACKUP_DIR}/${BACKUP_FILENAME}"

# Mask credentials for logging
SAFE_URI=$(echo "${TARGET_URI}" | sed -E 's/\/\/(.*)@/\/\/***:***@/')

echo "=================================================="
echo " Dwellio Database Backup Service"
echo " Timestamp : $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo " Target DB : ${SAFE_URI}"
echo " Output Dir: ${BACKUP_DIR}"
echo " File Name : ${BACKUP_FILENAME}"
echo "=================================================="

# Ensure destination directory exists
mkdir -p "${BACKUP_DIR}"

echo "[Backup] Starting mongodump..."

# Execute mongodump with gzip compression and single archive output
if mongodump --uri="${TARGET_URI}" --archive="${BACKUP_FILEPATH}" --gzip; then
  echo "[Backup] mongodump completed successfully."
else
  echo "[Backup Error] mongodump command failed with non-zero exit code." >&2
  exit 1
fi

# Verify archive exists and is non-empty
if [ ! -s "${BACKUP_FILEPATH}" ]; then
  echo "[Backup Error] Backup file was not created or is empty: ${BACKUP_FILEPATH}" >&2
  exit 1
fi

FILE_SIZE=$(ls -lh "${BACKUP_FILEPATH}" | awk '{print $5}')
echo "[Backup Success] Archive verified: ${BACKUP_FILEPATH} (${FILE_SIZE})"

# Retention management: Prune backups older than BACKUP_RETENTION_DAYS
echo "[Backup] Pruning archives older than ${BACKUP_RETENTION_DAYS} days in ${BACKUP_DIR}..."
find "${BACKUP_DIR}" -name "dwellio_backup_*.archive.gz" -type f -mtime +"${BACKUP_RETENTION_DAYS}" -exec rm -f {} +
echo "[Backup] Retention cleanup complete."

echo "=================================================="
echo " Backup finished successfully at $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "=================================================="
