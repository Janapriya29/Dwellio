#!/usr/bin/env bash
# ==============================================================================
# Dwellio Defensive Database Restore Script
# ==============================================================================
# Restores a compressed mongodump archive into a specified target database.
#
# Usage:
#   ./scripts/restore-db.sh --archive <path_to_archive> --db <target_db> [--confirm] [--force-production-restore]
#
# Examples:
#   # Safe test verification restore
#   ./scripts/restore-db.sh --archive ./backups/dwellio_backup_20261124.archive.gz --db dwellio_staging_verify --confirm
#
#   # Explicit production restoration (requires double safety flag)
#   ./scripts/restore-db.sh --archive ./backups/dwellio_backup_20261124.archive.gz --db dwellio --confirm --force-production-restore
# ==============================================================================

set -euo pipefail

ARCHIVE_PATH=""
TARGET_DB=""
CONFIRMED=false
FORCE_PROD=false
BASE_URI="${MONGO_URI:-mongodb://127.0.0.1:27017}"

# Parse command line flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    --archive)
      ARCHIVE_PATH="$2"
      shift 2
      ;;
    --db)
      TARGET_DB="$2"
      shift 2
      ;;
    --confirm)
      CONFIRMED=true
      shift
      ;;
    --force-production-restore)
      FORCE_PROD=true
      shift
      ;;
    -h|--help)
      echo "Usage: ./scripts/restore-db.sh --archive <file> --db <dbname> [--confirm] [--force-production-restore]"
      exit 0
      ;;
    *)
      echo "[Restore Error] Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

echo "=================================================="
echo " Dwellio Database Restore Utility"
echo " Timestamp : $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "=================================================="

# Validation 1: Require archive path
if [ -z "${ARCHIVE_PATH}" ]; then
  echo "[Restore Error] Missing required --archive argument." >&2
  echo "Usage: ./scripts/restore-db.sh --archive <file.archive.gz> --db <dbname> --confirm" >&2
  exit 1
fi

# Validation 2: Ensure archive file exists and is non-empty
if [ ! -f "${ARCHIVE_PATH}" ] || [ ! -s "${ARCHIVE_PATH}" ]; then
  echo "[Restore Error] Backup archive does not exist or is empty: ${ARCHIVE_PATH}" >&2
  exit 1
fi

# Validation 3: Require explicit target database name
if [ -z "${TARGET_DB}" ]; then
  echo "[Restore Error] Missing required --db argument. You must explicitly declare the target database name." >&2
  exit 1
fi

# Validation 4: Production restoration safety guard
if [ "${TARGET_DB}" = "dwellio" ] || [ "${TARGET_DB}" = "dwellio_production" ] || [ "${TARGET_DB}" = "production" ]; then
  if [ "${FORCE_PROD}" != "true" ]; then
    echo "--------------------------------------------------" >&2
    echo "[RESTORE SAFETY REFUSAL] TARGET IS A PRODUCTION DATABASE: '${TARGET_DB}'" >&2
    echo "To restore into a production database, you must supply both:" >&2
    echo "  --confirm AND --force-production-restore" >&2
    echo "Refusing to overwrite production data without explicit emergency authorization." >&2
    echo "--------------------------------------------------" >&2
    exit 1
  fi
fi

# Validation 5: Confirmation flag
if [ "${CONFIRMED}" != "true" ]; then
  echo "[Restore Refusal] Action unconfirmed. Supply --confirm to execute the restoration." >&2
  echo "Target Database: '${TARGET_DB}'" >&2
  echo "Archive Source : '${ARCHIVE_PATH}'" >&2
  exit 1
fi

SAFE_URI=$(echo "${BASE_URI}" | sed -E 's/\/\/(.*)@/\/\/***:***@/')

echo "[Restore Notice] PROCEEDING WITH RESTORE"
echo "  Target Database : ${TARGET_DB}"
echo "  Host Connection : ${SAFE_URI}"
echo "  Archive Source  : ${ARCHIVE_PATH}"
echo "--------------------------------------------------"

# Execute mongorestore with nsInclude to map archive data into target db
if mongorestore --uri="${BASE_URI}" --archive="${ARCHIVE_PATH}" --gzip --nsInclude="*.*" --nsFrom="*.*" --nsTo="${TARGET_DB}.*"; then
  echo "[Restore Success] Database restoration completed successfully into '${TARGET_DB}'."
else
  echo "[Restore Error] mongorestore failed with non-zero exit code." >&2
  exit 1
fi

echo "=================================================="
echo " Restore completed at $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "=================================================="
